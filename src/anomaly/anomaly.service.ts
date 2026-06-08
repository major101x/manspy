import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { NormalizedTransaction } from '../ingestion/transaction-normalizer.service';
import {
  AddressLabelService,
  EnrichedLabel,
} from '../common/chain-intel/address-label.service';
import { RecentTxBufferService } from '../common/chain-intel/recent-tx-buffer.service';
import { FlowAggregatorService } from '../common/chain-intel/flow-aggregator.service';
import { AlertLogService } from '../web3/alert-log.service';
import {
  summarizeTxActivity,
  nansenLabelFor,
  recentCounterparties,
} from '../nansen/nansen.util';

export interface WalletContext {
  fromTxCount: number;
  toTxCount: number;
  fromRecentTxCount: number;
  toRecentTxCount: number;
}

export interface AnomalyResult {
  pattern: string;
  risk_level: string;
  summary: string;
  confidence: number;
}

export interface WalletAnalysis {
  address: string;
  label: string | null; // known-entity name, e.g. "Bybit Hot Wallet"
  holdingsUsd: number | null; // Nansen current-balance total
  topHoldings: { symbol: string; valueUsd: number }[];
  realizedPnlUsd: number | null; // Nansen pnl-summary (30d)
  winRate: number | null;
  nansenTxCount30d: number | null; // sampled tx count from Nansen (last 30d)
  nansenMoreTx: boolean; // true when there are more txs than we sampled
  recentNetUsd: number; // from in-memory buffer (this session)
  recentTxCount: number;
  verdict: AnomalyResult | null;
  hasData: boolean; // false when nothing is known about the address
}

interface AlertTarget {
  messageId: number;
  chatId: number;
  reason: string;
  text: string;
}

@Injectable()
export class AnomalyService {
  private readonly logger = new Logger(AnomalyService.name);
  private ai: OpenAI;
  private recentResults: Array<{
    timestamp: number;
    pairKey: string;
    result: AnomalyResult | null;
    batchSize: number;
  }> = [];

  constructor(
    private labels: AddressLabelService,
    private buffer: RecentTxBufferService,
    private flow: FlowAggregatorService,
    private alertLog: AlertLogService,
  ) {
    this.ai = new OpenAI({
      apiKey: process.env.GROQ_API_KEY!,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }

  getRecentResults(limit = 5) {
    return this.recentResults.slice(-limit).map((r) => ({
      time: new Date(r.timestamp).toISOString(),
      pair: r.pairKey,
      batchSize: r.batchSize,
      ...r.result,
    }));
  }

  /**
   * Analyze a transaction immediately using Groq.
   * No batching — every alert gets instant AI analysis.
   */
  async analyze(
    tx: NormalizedTransaction,
    usdValue: number,
    tokenLabel: string | undefined,
    wallet: WalletContext,
    messageIds: Map<string, AlertTarget>,
    onResult: (result: AnomalyResult | null, batchSize: number) => void,
  ): Promise<void> {
    const pairKey = `${tx.from}:${tx.to ?? 'null'}`;

    try {
      const prompt = await this.buildPrompt(tx, usdValue, tokenLabel, wallet);

      const response = await this.ai.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content:
              'You are an on-chain intelligence analyst for Mantle Network. You analyze transactions and wallet behavior to identify patterns. You have access to recent transaction history, entity labels, and wallet activity counts. Be concise, factual, and actionable. Never make buy/sell recommendations. Never hallucinate information not in the data.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 256,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(content);

      this.logger.log(`Groq result for ${pairKey}: ${JSON.stringify(parsed)}`);

      if (!parsed.summary) {
        onResult(null, 1);
        return;
      }

      const result: AnomalyResult = {
        pattern: parsed.pattern ?? 'unknown',
        risk_level: parsed.risk_level ?? 'unknown',
        summary: parsed.summary,
        confidence:
          typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };

      this.recentResults.push({
        timestamp: Date.now(),
        pairKey,
        result,
        batchSize: 1,
      });
      if (this.recentResults.length > 20) this.recentResults.shift();

      onResult(result, 1);

      // Log to blockchain
      this.alertLog
        .logAlert(
          tx.txHash,
          result.pattern,
          result.risk_level,
          result.confidence,
        )
        .catch((e) => this.logger.warn(`On-chain log failed: ${e?.message}`));

      this.logger.log(`AI anomaly (${result.confidence}): ${result.summary}`);
    } catch (e: any) {
      this.logger.warn(`Groq analysis failed for ${pairKey}: ${e?.message}`);
      this.recentResults.push({
        timestamp: Date.now(),
        pairKey,
        result: null,
        batchSize: 1,
      });
      if (this.recentResults.length > 20) this.recentResults.shift();
      onResult(null, 1);
    }
  }

  /**
   * On-demand profile of a single wallet (the /analyse command). Pulls the
   * Nansen trio (via AddressLabelService), this session's buffered activity,
   * and a known-entity label, then asks Groq to classify the wallet. Not part
   * of the alert hot path and never logged on-chain (no txHash to key on).
   */
  async analyzeWallet(address: string): Promise<WalletAnalysis> {
    const enriched = await this.labels.lookupWithEnrichment(address);
    const activity = this.flow.computeAddressActivity(address);

    // Extract Nansen fields (same shape as buildPrompt uses)
    let holdingsUsd: number | null = null;
    const topHoldings: { symbol: string; valueUsd: number }[] = [];
    if (enriched.nansen?.currentBalance?.data?.length) {
      holdingsUsd = enriched.nansen.currentBalance.data.reduce(
        (sum, t) => sum + (t.value_usd ?? 0),
        0,
      );
      for (const t of enriched.nansen.currentBalance.data.slice(0, 3)) {
        if ((t.value_usd ?? 0) > 0) {
          topHoldings.push({
            symbol: t.token_symbol,
            valueUsd: t.value_usd ?? 0,
          });
        }
      }
    }

    const realizedPnlUsd =
      enriched.nansen?.pnlSummary?.realized_pnl_usd ?? null;
    const winRate = enriched.nansen?.pnlSummary?.win_rate ?? null;
    const txActivity = summarizeTxActivity(enriched.nansen?.transactions ?? null);

    // Prefer our curated label; fall back to Nansen's own label for the address
    // (harvested from the counterparty legs in its transactions response).
    const label =
      enriched.label?.name ??
      nansenLabelFor(enriched.nansen?.transactions ?? null, address);

    const base: WalletAnalysis = {
      address,
      label,
      holdingsUsd,
      topHoldings,
      realizedPnlUsd,
      winRate,
      nansenTxCount30d: txActivity.count || null,
      nansenMoreTx: txActivity.hasMore,
      recentNetUsd: activity.netUsd,
      recentTxCount: activity.txCount,
      verdict: null,
      hasData: false,
    };

    // Nothing known about this address — skip Groq, let the caller say so.
    if (!enriched.label && !enriched.nansen && activity.txCount === 0) {
      return base;
    }
    base.hasData = true;

    try {
      const prompt = this.buildWalletPrompt(base, enriched);
      const response = await this.ai.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content:
              'You are an on-chain intelligence analyst for Mantle Network. You analyze transactions and wallet behavior to identify patterns. You have access to recent transaction history, entity labels, and wallet activity counts. Be concise, factual, and actionable. Never make buy/sell recommendations. Never hallucinate information not in the data.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 256,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(content);
      if (parsed.summary) {
        base.verdict = {
          pattern: parsed.pattern ?? 'unknown',
          risk_level: parsed.risk_level ?? 'unknown',
          summary: parsed.summary,
          confidence:
            typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        };
      }
    } catch (e: any) {
      this.logger.warn(`Wallet analysis failed for ${address}: ${e?.message}`);
    }

    return base;
  }

  private buildWalletPrompt(
    a: WalletAnalysis,
    enriched: EnrichedLabel,
  ): string {
    let dataBlock = `Address: ${a.address}\n`;
    dataBlock += `Known entity: ${a.label ?? 'none (unlabeled address)'}\n`;

    if (a.holdingsUsd && a.holdingsUsd > 0) {
      dataBlock += `Holdings: $${(a.holdingsUsd / 1e6).toFixed(2)}M total`;
      if (a.topHoldings.length) {
        dataBlock += ` (${a.topHoldings
          .map((t) => `${t.symbol} $${(t.valueUsd / 1e6).toFixed(2)}M`)
          .join(', ')})`;
      }
      dataBlock += '\n';
    }
    if (a.realizedPnlUsd !== null) {
      dataBlock += `PnL (30d): $${(a.realizedPnlUsd / 1e3).toFixed(1)}K realized`;
      if (a.winRate !== null) {
        dataBlock += `, ${(a.winRate * 100).toFixed(0)}% win rate`;
      }
      dataBlock += '\n';
    }
    if (a.nansenTxCount30d !== null) {
      const more = a.nansenMoreTx ? '+' : '';
      dataBlock += `Activity (30d): ${a.nansenTxCount30d.toLocaleString()}${more} transactions${
        a.nansenMoreTx ? ' (high activity, sampled)' : ''
      }\n`;
    }
    if (a.recentTxCount > 0) {
      const sign = a.recentNetUsd < 0 ? '-' : '+';
      dataBlock += `Recent (this session): ${sign}$${Math.round(
        Math.abs(a.recentNetUsd),
      ).toLocaleString()} net across ${a.recentTxCount} tx(s)\n`;
    }
    const counterparties = recentCounterparties(
      enriched.nansen?.transactions ?? null,
      a.address,
    );
    if (counterparties.length) {
      dataBlock += `Recent counterparties:\n`;
      for (const c of counterparties) {
        dataBlock += `  - ${c.label} ($${Math.round(c.volumeUsd).toLocaleString()})\n`;
      }
    }

    return `Classify the following Mantle wallet by its profile and behaviour.

${dataBlock}
Pattern definitions:
- cex_withdrawal: CEX hot/cold wallet
- bridge_deposit: bridge contract
- new_wallet_funding: fresh address, minimal history
- contract_interaction: smart contract (DEX, lending, etc.)
- dormant_awakening: inactive >30 days, suddenly active
- aggregator: swap aggregator
- whale_distribution: $1M+ holder spreading to multiple wallets
- smart_money_rotation: profitable trader (>70% win rate) repositioning
- sell_pressure: net mover toward CEX deposit addresses
- accumulation: balance growing, repeated inbound
- treasury_rebalance: protocol/DAO wallet
- unknown: insufficient signal

Summary rules:
1. Describe the WALLET, not a single transaction. Lead with what it is.
2. If it's a known entity, name it: "Bybit Hot Wallet", "Agni Finance Router".
3. If holdings >$1M, mention the top holding: "USDe-heavy holder ($45M)".
4. If >1000 txs, call it a "veteran wallet"; if <50, "fresh wallet".
5. If Nansen PnL shows >70% win rate, flag as "profitable trader" / "Smart Money".
6. Always include concrete dollar amounts where present — never vague "large".
7. If data is thin (unlabeled, no Nansen, little activity), say so honestly rather than inventing a narrative.

Respond in JSON with these exact keys:
{
  "pattern": "cex_withdrawal|bridge_deposit|new_wallet_funding|contract_interaction|dormant_awakening|aggregator|whale_distribution|smart_money_rotation|sell_pressure|accumulation|treasury_rebalance|unknown",
  "risk_level": "low|medium|high",
  "summary": "One concise sentence, max 30 words, describing the wallet using the rules above.",
  "confidence": 0.0-1.0
}`;
  }

  private async buildPrompt(
    tx: NormalizedTransaction,
    usdValue: number,
    tokenLabel: string | undefined,
    wallet: WalletContext,
  ): Promise<string> {
    // Enrich with Nansen (parallel, non-blocking if fails)
    const [fromEnriched, toEnriched] = await Promise.all([
      this.labels.lookupWithEnrichment(tx.from),
      tx.to
        ? this.labels.lookupWithEnrichment(tx.to)
        : Promise.resolve({ label: null, nansen: null }),
    ]);

    const fromLabel = this.labels.describeEnriched(
      fromEnriched,
      wallet.fromTxCount,
    );
    const toLabel = this.labels.describeEnriched(toEnriched, wallet.toTxCount);

    // Recent history for sender and recipient
    const senderHistory = this.buffer.getRecentForAddress(tx.from, 5);
    const recipientHistory = tx.to
      ? this.buffer.getRecentForAddress(tx.to, 5)
      : [];

    const pairHistory = this.buffer.getRecentForPair(tx.from, tx.to, 5);

    let historyBlock = '';

    if (senderHistory.length > 1) {
      historyBlock += `\nSender recent activity (${senderHistory.length - 1} prior txs in buffer):\n`;
      for (const h of senderHistory.slice(0, -1)) {
        const val = h.usdValue ?? 0;
        historyBlock += `  - ${h.tx.txHash.slice(0, 12)}… → ${h.tx.to?.slice(0, 12) ?? 'deploy'}… $${val.toLocaleString()}\n`;
      }
    }

    if (recipientHistory.length > 1) {
      historyBlock += `\nRecipient recent activity (${recipientHistory.length - 1} prior txs in buffer):\n`;
      for (const h of recipientHistory.slice(0, -1)) {
        const val = h.usdValue ?? 0;
        historyBlock += `  - ${h.tx.from.slice(0, 12)}… → ${h.tx.txHash.slice(0, 12)}… $${val.toLocaleString()}\n`;
      }
    }

    if (pairHistory.length > 1) {
      historyBlock += `\nThis exact pair recent activity (${pairHistory.length - 1} prior txs in buffer):\n`;
      for (const h of pairHistory.slice(0, -1)) {
        const val = h.usdValue ?? 0;
        historyBlock += `  - ${h.tx.txHash.slice(0, 12)}… $${val.toLocaleString()} ${h.tokenLabel ?? ''}\n`;
      }
    }

    // Aggregated flow signals over a rolling window (the differentiator vs. single-tx restating)
    const flow = this.flow.computeFlowContext(tx);
    const windowMin = Math.round(flow.windowMs / 60000);
    let flowBlock = `\nFlow analysis (last ${windowMin}m):\n`;
    flowBlock += `  - Sender net: ${this.fmtSigned(flow.senderNetUsd)} across ${flow.senderTxCount} tx(s)\n`;
    if (tx.to) {
      flowBlock += `  - Recipient net: ${this.fmtSigned(flow.recipientNetUsd)} across ${flow.recipientTxCount} tx(s)\n`;
    }
    if (flow.pairCount > 1) {
      flowBlock += `  - This pair: ${this.ordinal(flow.pairOrdinal)} transfer, $${Math.round(flow.pairCumulativeUsd).toLocaleString()} cumulative (velocity: ${flow.pairVelocity})\n`;
    }
    if (flow.cexNote) {
      flowBlock += `  - CEX context: ${flow.cexNote}\n`;
    }

    // Nansen intelligence context
    let nansenBlock = '';
    if (fromEnriched.nansen || toEnriched.nansen) {
      nansenBlock = '\nNansen intelligence:\n';
      for (const enriched of [fromEnriched, toEnriched]) {
        if (!enriched.nansen) continue;
        const addr = enriched.nansen.address;
        const shortAddr = `${addr.slice(0, 6)}…${addr.slice(-4)}`;
        nansenBlock += `\n${shortAddr}:\n`;

        if (enriched.nansen.currentBalance?.data?.length) {
          const totalUsd = enriched.nansen.currentBalance.data.reduce(
            (sum, t) => sum + (t.value_usd ?? 0),
            0,
          );
          if (totalUsd > 0) {
            nansenBlock += `  - Holdings: $${(totalUsd / 1e6).toFixed(2)}M total\n`;
            const top3 = enriched.nansen.currentBalance.data.slice(0, 3);
            const topLines = top3
              .filter((t) => (t.value_usd ?? 0) > 0)
              .map(
                (t) =>
                  `${t.token_symbol} $${((t.value_usd ?? 0) / 1e6).toFixed(2)}M`,
              )
              .join(', ');
            if (topLines) nansenBlock += `    Top: ${topLines}\n`;
          }
        }

        if (enriched.nansen.pnlSummary) {
          const pnl = enriched.nansen.pnlSummary;
          const realized = pnl.realized_pnl_usd ?? 0;
          const winRate = pnl.win_rate ?? 0;
          nansenBlock += `  - PnL: $${(realized / 1e3).toFixed(1)}K realized, ${(winRate * 100).toFixed(0)}% win rate\n`;
        }

        if (enriched.nansen.transactions) {
          const act = summarizeTxActivity(enriched.nansen.transactions);
          if (act.count > 0) {
            const more = act.hasMore ? '+' : '';
            nansenBlock += `  - Activity (30d): ${act.count.toLocaleString()}${more} transactions${
              act.hasMore ? ' (high activity)' : ''
            }\n`;
          }
        }
      }
    }

    return `Analyze the following transaction for patterns and risk.

Transaction data:
Sender: ${tx.from} — ${fromLabel}
Recipient: ${tx.to ?? 'Contract Deployment'} — ${toLabel}
Value: ${tokenLabel ?? `${Number(tx.value ?? 0) / 1e18} MNT`} (~$${(usdValue ?? 0).toLocaleString()})
${historyBlock}
${flowBlock}
${nansenBlock}

Pattern definitions:
- batch_transfer: multiple rapid transfers between same pair
- cex_withdrawal: funds leaving exchange hot wallet
- bridge_deposit: moving to bridge contract
- new_wallet_funding: first significant inflow to fresh address
- contract_interaction: calling a smart contract (DEX, lending, etc.)
- dormant_awakening: wallet inactive >30 days, suddenly active
- aggregator: routing through swap aggregator
- whale_distribution: $1M+ holder spreading to multiple wallets
- smart_money_rotation: Nansen shows profitable trader (>70% win rate) repositioning
- sell_pressure: funds moving to known CEX deposit address
- accumulation: repeated inbound transfers, balance growing >20%
- treasury_rebalance: protocol/DAO wallet moving between internal wallets
- unknown: none of the above

Summary rules:
1. NEVER say "Large MNT transfer" or "Sender transfers MNT" — that's restating the obvious.
2. If recipient holds >$1M per Nansen, mention their top holding: "to USDe-heavy holder" or "to MNT whale".
3. If wallet has >1000 txs, call it "veteran wallet"; if <50 txs, call it "fresh wallet".
4. If Nansen PnL shows >70% win rate, flag as "profitable trader" or "Smart Money".
5. Name the sender if it's a known entity: "Bybit Hot Wallet", "Agni Finance Router", etc.
6. Always include the dollar amount: "$15K", "$124K" — never vague "large".
7. State direction + likely intent: "inflow to accumulation wallet" or "outflow from CEX, likely sell".
8. If the Flow analysis shows this is a repeated/rapid pair (ordinal >1), lead with the aggregate, not the single tx: "3rd Bybit outflow in 30m, $X cumulative" beats "Bybit outflow $Y".

Example summaries:
- BAD: "Large MNT transfer from low-holding wallet"
  GOOD: "$15K MNT to USDe-heavy holder ($45M portfolio) — possible OTC or rebalancing"
- BAD: "Sender transfers MNT to recipient in large batch"
  GOOD: "Bybit chunked $100K MNT to fresh wallet in 3 rapid transfers — automated CEX payout"
- BAD: "Contract interaction with medium risk"
  GOOD: "$124K MNT to veteran wallet (1,247 txs) with diverse $12M holdings — treasury movement"

Respond in JSON with these exact keys:
{
  "pattern": "batch_transfer|cex_withdrawal|bridge_deposit|new_wallet_funding|contract_interaction|dormant_awakening|aggregator|whale_distribution|smart_money_rotation|sell_pressure|accumulation|treasury_rebalance|unknown",
  "risk_level": "low|medium|high",
  "summary": "One concise sentence, max 30 words, using the rules above.",
  "confidence": 0.0-1.0
}`;
  }

  private fmtSigned(usd: number): string {
    const sign = usd < 0 ? '-' : '+';
    return `${sign}$${Math.round(Math.abs(usd)).toLocaleString()}`;
  }

  private ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
  }
}
