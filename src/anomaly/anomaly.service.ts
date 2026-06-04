import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { NormalizedTransaction } from '../ingestion/transaction-normalizer.service';
import { AddressLabelService } from '../common/chain-intel/address-label.service';
import { RecentTxBufferService } from '../common/chain-intel/recent-tx-buffer.service';
import { AlertLogService } from '../web3/alert-log.service';

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
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };

      this.recentResults.push({ timestamp: Date.now(), pairKey, result, batchSize: 1 });
      if (this.recentResults.length > 20) this.recentResults.shift();

      onResult(result, 1);

      // Log to blockchain
      this.alertLog
        .logAlert(tx.txHash, result.pattern, result.risk_level, result.confidence)
        .catch((e) => this.logger.warn(`On-chain log failed: ${e?.message}`));

      this.logger.log(`AI anomaly (${result.confidence}): ${result.summary}`);
    } catch (e: any) {
      this.logger.warn(`Groq analysis failed for ${pairKey}: ${e?.message}`);
      this.recentResults.push({ timestamp: Date.now(), pairKey, result: null, batchSize: 1 });
      if (this.recentResults.length > 20) this.recentResults.shift();
      onResult(null, 1);
    }
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
      tx.to ? this.labels.lookupWithEnrichment(tx.to) : Promise.resolve({ label: null, nansen: null }),
    ]);

    const fromLabel = this.labels.describeEnriched(fromEnriched, wallet.fromTxCount);
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
          const totalUsd = enriched.nansen.currentBalance.data.reduce((sum, t) => sum + (t.value_usd ?? 0), 0);
          if (totalUsd > 0) {
            nansenBlock += `  - Holdings: $${(totalUsd / 1e6).toFixed(2)}M total\n`;
            const top3 = enriched.nansen.currentBalance.data.slice(0, 3);
            const topLines = top3
              .filter(t => (t.value_usd ?? 0) > 0)
              .map(t => `${t.token_symbol} $${((t.value_usd ?? 0) / 1e6).toFixed(2)}M`)
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
          const txCount = enriched.nansen.transactions.total_count ?? enriched.nansen.transactions.items?.length ?? 0;
          if (txCount > 0) {
            nansenBlock += `  - Activity: ${txCount.toLocaleString()} total transactions\n`;
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
}
