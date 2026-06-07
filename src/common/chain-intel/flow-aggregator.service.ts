import { Injectable } from '@nestjs/common';
import { NormalizedTransaction } from '../../ingestion/transaction-normalizer.service';
import { RecentTxBufferService } from './recent-tx-buffer.service';
import { AddressLabelService } from './address-label.service';

export interface AccumulatorEntry {
  address: string;
  netUsd: number;
}

export interface DistributionWave {
  from: string;
  fromLabel: string | null;
  recipientCount: number;
  totalUsd: number;
}

export interface MarketFlows {
  /** How far back the in-window data actually reaches (ms). May be < requested window. */
  windowCoveredMs: number;
  txCount: number;
  cexInflowUsd: number; // funds moving INTO CEX hot wallets (sell-side)
  cexOutflowUsd: number; // funds leaving CEX hot wallets (withdrawals)
  cexNetUsd: number; // outflow - inflow (>0 = net withdrawal = accumulation signal)
  cexInCount: number;
  cexOutCount: number;
  topAccumulators: AccumulatorEntry[];
  distributionWaves: DistributionWave[];
}

export interface FlowContext {
  windowMs: number;
  senderNetUsd: number; // inflow - outflow for the sender over the window
  senderTxCount: number;
  recipientNetUsd: number;
  recipientTxCount: number;
  pairCount: number; // number of from->to txs in window (incl. current)
  pairCumulativeUsd: number;
  pairOrdinal: number; // this tx is the Nth on the pair within the window
  pairVelocity: 'single' | 'repeated' | 'rapid';
  cexNote: string | null;
}

const HOUR_MS = 3_600_000;
const HALF_HOUR_MS = 1_800_000;
// Floor for surfacing an accumulator — below this, net flow is rounding noise
// that would display as "+$0".
const MIN_ACCUMULATOR_USD = 1;

/**
 * Turns the ephemeral RecentTxBuffer into aggregated flow signals — market-wide
 * (computeMarketFlows) and per-transaction (computeFlowContext). The buffer is
 * in-memory and count-bounded, so coverage is reported honestly rather than
 * assumed to span the full requested window.
 */
@Injectable()
export class FlowAggregatorService {
  constructor(
    private readonly buffer: RecentTxBufferService,
    private readonly labels: AddressLabelService,
  ) {}

  computeMarketFlows(windowMs = HOUR_MS): MarketFlows {
    const now = Date.now();
    const cutoff = now - windowMs;
    const inWindow = this.buffer.getAll().filter((b) => b.timestamp >= cutoff);

    let cexInflowUsd = 0;
    let cexOutflowUsd = 0;
    let cexInCount = 0;
    let cexOutCount = 0;
    let oldest = now;

    // net inbound USD per address (for accumulators)
    const netByAddress = new Map<string, number>();
    // distinct recipients + total per sender (for distribution waves)
    const fanOut = new Map<
      string,
      { recipients: Set<string>; totalUsd: number }
    >();

    for (const b of inWindow) {
      if (b.timestamp < oldest) oldest = b.timestamp;

      const usd = b.usdValue ?? 0;
      const from = b.tx.from;
      const to = b.tx.to;

      const fromType = this.labels.lookup(from)?.type;
      const toType = to ? this.labels.lookup(to)?.type : undefined;

      if (toType === 'cex') {
        cexInflowUsd += usd;
        cexInCount += 1;
      }
      if (fromType === 'cex') {
        cexOutflowUsd += usd;
        cexOutCount += 1;
      }

      // accumulators: ignore non-wallet entities (cex/dex/token/protocol contracts)
      if (to && !this.isEntity(toType)) {
        netByAddress.set(to, (netByAddress.get(to) ?? 0) + usd);
      }
      if (from && !this.isEntity(fromType)) {
        netByAddress.set(from, (netByAddress.get(from) ?? 0) - usd);
      }

      // distribution waves
      if (to) {
        const entry = fanOut.get(from) ?? {
          recipients: new Set<string>(),
          totalUsd: 0,
        };
        entry.recipients.add(to);
        entry.totalUsd += usd;
        fanOut.set(from, entry);
      }
    }

    const topAccumulators: AccumulatorEntry[] = [...netByAddress.entries()]
      .map(([address, netUsd]) => ({ address, netUsd }))
      .filter((e) => e.netUsd >= MIN_ACCUMULATOR_USD)
      .sort((a, b) => b.netUsd - a.netUsd)
      .slice(0, 3);

    const distributionWaves: DistributionWave[] = [...fanOut.entries()]
      .filter(([, v]) => v.recipients.size >= 3)
      .map(([from, v]) => ({
        from,
        fromLabel: this.labels.lookup(from)?.name ?? null,
        recipientCount: v.recipients.size,
        totalUsd: v.totalUsd,
      }))
      .sort((a, b) => b.totalUsd - a.totalUsd)
      .slice(0, 3);

    return {
      windowCoveredMs: inWindow.length ? now - oldest : 0,
      txCount: inWindow.length,
      cexInflowUsd,
      cexOutflowUsd,
      cexNetUsd: cexOutflowUsd - cexInflowUsd,
      cexInCount,
      cexOutCount,
      topAccumulators,
      distributionWaves,
    };
  }

  computeFlowContext(
    tx: NormalizedTransaction,
    windowMs = HALF_HOUR_MS,
  ): FlowContext {
    const cutoff = Date.now() - windowMs;

    const senderTxs = this.buffer
      .getRecentForAddress(tx.from, 1000)
      .filter((b) => b.timestamp >= cutoff);
    const recipientTxs = tx.to
      ? this.buffer
          .getRecentForAddress(tx.to, 1000)
          .filter((b) => b.timestamp >= cutoff)
      : [];
    const pairTxs = this.buffer
      .getRecentForPair(tx.from, tx.to, 1000)
      .filter((b) => b.timestamp >= cutoff);

    const pairCumulativeUsd = pairTxs.reduce(
      (sum, b) => sum + (b.usdValue ?? 0),
      0,
    );
    const pairCount = pairTxs.length;
    const pairVelocity: FlowContext['pairVelocity'] =
      pairCount >= 3 ? 'rapid' : pairCount >= 2 ? 'repeated' : 'single';

    let cexNote: string | null = null;
    const fromCex = this.labels.lookup(tx.from);
    const toCex = tx.to ? this.labels.lookup(tx.to) : null;
    if (toCex?.type === 'cex') {
      cexNote = `recipient is ${toCex.name} (sell-side / deposit)`;
    } else if (fromCex?.type === 'cex') {
      cexNote = `sender is ${fromCex.name} (withdrawal / outflow)`;
    }

    return {
      windowMs,
      senderNetUsd: this.netFor(tx.from, senderTxs),
      senderTxCount: senderTxs.length,
      recipientNetUsd: tx.to ? this.netFor(tx.to, recipientTxs) : 0,
      recipientTxCount: recipientTxs.length,
      pairCount,
      pairCumulativeUsd,
      pairOrdinal: pairCount,
      pairVelocity,
      cexNote,
    };
  }

  /**
   * Recent buffered activity for a single address (net flow + tx count) over a
   * window. Used by the on-demand wallet analyser, which has no tx to derive a
   * full FlowContext from. Reflects only this session's in-memory buffer.
   */
  computeAddressActivity(
    address: string,
    windowMs = HOUR_MS,
  ): { netUsd: number; txCount: number } {
    const cutoff = Date.now() - windowMs;
    const txs = this.buffer
      .getRecentForAddress(address, 1000)
      .filter((b) => b.timestamp >= cutoff);
    return { netUsd: this.netFor(address, txs), txCount: txs.length };
  }

  /** net = inbound (address is recipient) - outbound (address is sender) */
  private netFor(
    address: string,
    txs: Array<{ tx: NormalizedTransaction; usdValue: number }>,
  ): number {
    const lower = address.toLowerCase();
    let net = 0;
    for (const b of txs) {
      const usd = b.usdValue ?? 0;
      if ((b.tx.to ?? '').toLowerCase() === lower) net += usd;
      if (b.tx.from.toLowerCase() === lower) net -= usd;
    }
    return net;
  }

  private isEntity(type: string | undefined): boolean {
    return (
      type === 'cex' ||
      type === 'dex' ||
      type === 'token' ||
      type === 'protocol' ||
      type === 'bridge'
    );
  }
}
