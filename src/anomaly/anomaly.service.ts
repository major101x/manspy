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
        historyBlock += `  - ${h.tx.txHash.slice(0, 12)}… → ${h.tx.to?.slice(0, 12) ?? 'deploy'}… $${h.usdValue.toLocaleString()}\n`;
      }
    }

    if (recipientHistory.length > 1) {
      historyBlock += `\nRecipient recent activity (${recipientHistory.length - 1} prior txs in buffer):\n`;
      for (const h of recipientHistory.slice(0, -1)) {
        historyBlock += `  - ${h.tx.from.slice(0, 12)}… → ${h.tx.txHash.slice(0, 12)}… $${h.usdValue.toLocaleString()}\n`;
      }
    }

    if (pairHistory.length > 1) {
      historyBlock += `\nThis exact pair recent activity (${pairHistory.length - 1} prior txs in buffer):\n`;
      for (const h of pairHistory.slice(0, -1)) {
        historyBlock += `  - ${h.tx.txHash.slice(0, 12)}… $${h.usdValue.toLocaleString()} ${h.tokenLabel ?? ''}\n`;
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
          const totalUsd = enriched.nansen.currentBalance.data.reduce((sum, t) => sum + (t.value_usd || 0), 0);
          nansenBlock += `  - Holdings: $${(totalUsd / 1e6).toFixed(2)}M total\n`;
          const top3 = enriched.nansen.currentBalance.data.slice(0, 3);
          nansenBlock += `    Top: ${top3.map(t => `${t.token_symbol} $${(t.value_usd / 1e6).toFixed(2)}M`).join(', ')}\n`;
        }

        if (enriched.nansen.pnlSummary) {
          const pnl = enriched.nansen.pnlSummary;
          nansenBlock += `  - PnL: $${(pnl.realized_pnl_usd / 1e3).toFixed(1)}K realized, ${(pnl.win_rate * 100).toFixed(0)}% win rate\n`;
        }

        if (enriched.nansen.transactions) {
          nansenBlock += `  - Activity: ${enriched.nansen.transactions.total_count.toLocaleString()} total transactions\n`;
        }
      }
    }

    return `Analyze the following transaction for patterns and risk:

Sender: ${tx.from} — ${fromLabel}
Recipient: ${tx.to ?? 'Contract Deployment'} — ${toLabel}
Value: ${tokenLabel ?? `${Number(tx.value) / 1e18} MNT`} (~$${usdValue.toLocaleString()})
${historyBlock}
${nansenBlock}

Identify the pattern and risk. If the sender is a known CEX/bridge/protocol, name it. If multiple rapid transfers exist, note the batch pattern. If the recipient is new but just received multiple transfers, do NOT call it "new wallet funding" for each — describe the batch behavior.

Respond in JSON with these exact keys:
{
  "pattern": "batch_transfer|cex_withdrawal|bridge_deposit|new_wallet_funding|contract_interaction|dormant_awakening|aggregator|unknown",
  "risk_level": "low|medium|high",
  "summary": "One concise sentence, max 25 words, describing what happened and why it matters.",
  "confidence": 0.0-1.0
}`;
  }
}
