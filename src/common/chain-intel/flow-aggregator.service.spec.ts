import { FlowAggregatorService } from './flow-aggregator.service';
import { RecentTxBufferService } from './recent-tx-buffer.service';
import { AddressLabelService } from './address-label.service';
import { NormalizedTransaction } from '../../ingestion/transaction-normalizer.service';

const BYBIT = '0x0000004eba872864a71b957180eb17dff71bb8f1'; // labeled 'cex'
const WALLET_A = '0x000000000000000000000000000000000000aaaa';
const WALLET_B = '0x000000000000000000000000000000000000bbbb';
const WALLET_C = '0x000000000000000000000000000000000000cccc';
const WALLET_D = '0x000000000000000000000000000000000000dddd';

function tx(from: string, to: string | null): NormalizedTransaction {
  return {
    txHash:
      '0x' +
      Math.abs(from.length * 7 + (to?.length ?? 0))
        .toString(16)
        .padStart(64, '0'),
    from,
    to,
    value: 0n,
    gas: 0n,
    gasPrice: 0n,
    blockNumber: 1n,
    timestamp: Math.floor(Date.now() / 1000),
  };
}

describe('FlowAggregatorService', () => {
  let buffer: RecentTxBufferService;
  let labels: AddressLabelService;
  let flow: FlowAggregatorService;
  let nowSpy: jest.SpyInstance;
  const NOW = 1_000_000_000_000;

  beforeEach(() => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
    buffer = new RecentTxBufferService();
    // AddressLabelService only needs lookup() here; Nansen is never called.
    labels = new AddressLabelService({} as any);
    flow = new FlowAggregatorService(buffer, labels);
  });

  afterEach(() => nowSpy.mockRestore());

  /** add a buffered tx with a controlled age (minutes ago) */
  function addAt(
    from: string,
    to: string | null,
    usd: number,
    minutesAgo: number,
  ) {
    nowSpy.mockReturnValue(NOW - minutesAgo * 60_000);
    buffer.add(tx(from, to), usd, undefined);
    nowSpy.mockReturnValue(NOW);
  }

  describe('computeMarketFlows', () => {
    it('returns empty signal when buffer has nothing in window', () => {
      addAt(WALLET_A, WALLET_B, 100, 120); // 2h ago, outside 1h window
      const f = flow.computeMarketFlows();
      expect(f.txCount).toBe(0);
      expect(f.cexNetUsd).toBe(0);
      expect(f.windowCoveredMs).toBe(0);
    });

    it('computes net CEX flow (outflow positive)', () => {
      addAt(BYBIT, WALLET_A, 5000, 10); // withdrawal (outflow)
      addAt(BYBIT, WALLET_B, 3000, 8); // withdrawal (outflow)
      addAt(WALLET_C, BYBIT, 2000, 5); // deposit (inflow)

      const f = flow.computeMarketFlows();
      expect(f.txCount).toBe(3);
      expect(f.cexOutflowUsd).toBe(8000);
      expect(f.cexInflowUsd).toBe(2000);
      expect(f.cexNetUsd).toBe(6000);
      expect(f.cexOutCount).toBe(2);
      expect(f.cexInCount).toBe(1);
    });

    it('reports actual covered window, not the requested one', () => {
      addAt(WALLET_A, WALLET_B, 100, 20); // oldest in-window tx is 20m old
      addAt(WALLET_A, WALLET_C, 100, 5);
      const f = flow.computeMarketFlows();
      expect(Math.round(f.windowCoveredMs / 60000)).toBe(20);
    });

    it('ranks top accumulators by net inbound, excluding labeled entities', () => {
      addAt(BYBIT, WALLET_A, 10000, 10); // A receives 10k (net +10k)
      addAt(WALLET_A, WALLET_B, 4000, 8); // A sends 4k (net +6k), B receives 4k
      const f = flow.computeMarketFlows();
      expect(f.topAccumulators[0]).toEqual({ address: WALLET_A, netUsd: 6000 });
      expect(
        f.topAccumulators.find((a) => a.address === BYBIT),
      ).toBeUndefined();
    });

    it('excludes sub-dollar (rounding-noise) accumulators', () => {
      addAt(WALLET_A, WALLET_B, 0.3, 5); // B nets +$0.30 → must not surface as "+$0"
      addAt(BYBIT, WALLET_C, 50, 4); // C nets +$50 → surfaces
      const f = flow.computeMarketFlows();
      expect(f.topAccumulators.map((a) => a.address)).toEqual([WALLET_C]);
    });

    it('detects distribution waves (sender to >=3 distinct recipients)', () => {
      addAt(BYBIT, WALLET_A, 1000, 10);
      addAt(BYBIT, WALLET_B, 1000, 9);
      addAt(BYBIT, WALLET_C, 1000, 8);
      const f = flow.computeMarketFlows();
      expect(f.distributionWaves).toHaveLength(1);
      expect(f.distributionWaves[0]).toMatchObject({
        from: BYBIT,
        fromLabel: 'Bybit Hot Wallet',
        recipientCount: 3,
        totalUsd: 3000,
      });
    });

    it('does not flag a wave below the 3-recipient threshold', () => {
      addAt(WALLET_D, WALLET_A, 1000, 10);
      addAt(WALLET_D, WALLET_B, 1000, 9);
      const f = flow.computeMarketFlows();
      expect(f.distributionWaves).toHaveLength(0);
    });
  });

  describe('seed-flows demo scenario', () => {
    // Mirrors POST /test/seed-flows so the demo digest numbers are pinned.
    const w = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;

    it('produces the expected market digest', () => {
      addAt(BYBIT, w(1), 42000, 6);
      addAt(BYBIT, w(2), 21000, 5);
      addAt(BYBIT, w(3), 15000, 4);
      addAt(BYBIT, w(4), 9000, 3);
      addAt(w(5), BYBIT, 30000, 2); // deposit (inflow)
      addAt(w(6), w(1), 20000, 1); // W1 accumulates further

      const f = flow.computeMarketFlows();
      expect(f.cexOutflowUsd).toBe(87000);
      expect(f.cexInflowUsd).toBe(30000);
      expect(f.cexNetUsd).toBe(57000); // net withdrawal → accumulation signal
      expect(f.topAccumulators[0]).toEqual({ address: w(1), netUsd: 62000 });
      expect(f.distributionWaves[0]).toMatchObject({
        from: BYBIT,
        recipientCount: 4,
        totalUsd: 87000,
      });
    });
  });

  describe('computeFlowContext', () => {
    it('counts pair velocity and cumulative USD over the window', () => {
      addAt(BYBIT, WALLET_A, 1000, 6);
      addAt(BYBIT, WALLET_A, 2000, 4);
      addAt(BYBIT, WALLET_A, 3000, 2); // current tx already in buffer

      const ctx = flow.computeFlowContext(tx(BYBIT, WALLET_A));
      expect(ctx.pairCount).toBe(3);
      expect(ctx.pairCumulativeUsd).toBe(6000);
      expect(ctx.pairOrdinal).toBe(3);
      expect(ctx.pairVelocity).toBe('rapid');
      expect(ctx.cexNote).toContain('withdrawal');
    });

    it('computes signed sender/recipient net flow', () => {
      addAt(WALLET_A, WALLET_B, 5000, 5); // A out 5k, B in 5k
      const ctx = flow.computeFlowContext(tx(WALLET_A, WALLET_B));
      expect(ctx.senderNetUsd).toBe(-5000);
      expect(ctx.recipientNetUsd).toBe(5000);
    });

    it('flags sell-side when recipient is a CEX', () => {
      addAt(WALLET_A, BYBIT, 5000, 5);
      const ctx = flow.computeFlowContext(tx(WALLET_A, BYBIT));
      expect(ctx.cexNote).toContain('sell-side');
    });
  });

  describe('computeAddressActivity', () => {
    it('returns signed net flow and tx count over the window', () => {
      addAt(WALLET_B, WALLET_A, 5000, 10); // A receives 5k
      addAt(WALLET_A, WALLET_C, 2000, 5); // A sends 2k
      const act = flow.computeAddressActivity(WALLET_A);
      expect(act.txCount).toBe(2);
      expect(act.netUsd).toBe(3000); // +5000 - 2000
    });

    it('excludes activity outside the window', () => {
      addAt(WALLET_B, WALLET_A, 5000, 120); // 2h ago, outside 1h window
      const act = flow.computeAddressActivity(WALLET_A);
      expect(act.txCount).toBe(0);
      expect(act.netUsd).toBe(0);
    });
  });
});
