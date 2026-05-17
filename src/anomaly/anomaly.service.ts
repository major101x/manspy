import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { NormalizedTransaction } from '../ingestion/transaction-normalizer.service';
import { AddressLabelService } from '../common/chain-intel/address-label.service';
import { RecentTxBufferService } from '../common/chain-intel/recent-tx-buffer.service';

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

interface PendingBatch {
  txs: { tx: NormalizedTransaction; usdValue: number; tokenLabel: string | undefined }[];
  messageIds: Map<string, AlertTarget>;
  firstSeenAt: number;
}

@Injectable()
export class AnomalyService {
  private readonly logger = new Logger(AnomalyService.name);
  private ai: GoogleGenAI;
  private pendingBatches = new Map<string, PendingBatch>();
  private readonly batchWindowMs = 3 * 60 * 1000; // 3 minutes

  constructor(
    private labels: AddressLabelService,
    private buffer: RecentTxBufferService,
  ) {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }

  /**
   * Process an anomaly check, potentially batching rapid same-pair transfers.
   * For batched items, the callback is invoked after the batch window expires.
   * For immediate items, the callback is invoked immediately with the result.
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
    const existing = this.pendingBatches.get(pairKey);

    if (existing && Date.now() - existing.firstSeenAt < this.batchWindowMs) {
      // Add to existing batch
      existing.txs.push({ tx, usdValue, tokenLabel });
      // Merge messageIds
      for (const [k, v] of messageIds) {
        existing.messageIds.set(k, v);
      }
      this.logger.log(
        `Batching tx ${tx.txHash.slice(0, 10)}… into pair ${pairKey} (batch size: ${existing.txs.length})`,
      );
      return;
    }

    // Flush any expired batch for this pair
    if (existing) {
      this.pendingBatches.delete(pairKey);
    }

    // Start new batch
    const batch: PendingBatch = {
      txs: [{ tx, usdValue, tokenLabel }],
      messageIds: new Map(messageIds),
      firstSeenAt: Date.now(),
    };
    this.pendingBatches.set(pairKey, batch);

    // Wait for batch window, then analyze
    setTimeout(() => {
      this.flushBatch(pairKey, wallet, onResult).catch((e: any) =>
        this.logger.warn(`Batch flush failed: ${e?.message}`),
      );
    }, this.batchWindowMs);
  }

  private async flushBatch(
    pairKey: string,
    walletTemplate: WalletContext,
    onResult: (result: AnomalyResult | null, batchSize: number) => void,
  ) {
    const batch = this.pendingBatches.get(pairKey);
    if (!batch) return;
    this.pendingBatches.delete(pairKey);

    if (batch.txs.length === 0) return;

    // Use the most recent tx for wallet context (best effort)
    const latest = batch.txs[batch.txs.length - 1];

    const prompt = this.buildBatchPrompt(batch.txs, walletTemplate);

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      const parsed = JSON.parse(response.text ?? '{}');
      this.logger.log(
        `Gemini batch result for ${pairKey}: ${JSON.stringify(parsed)}`,
      );

      if (!parsed.summary) {
        onResult(null, batch.txs.length);
        return;
      }

      const result: AnomalyResult = {
        pattern: parsed.pattern ?? 'unknown',
        risk_level: parsed.risk_level ?? 'unknown',
        summary: parsed.summary,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };

      onResult(result, batch.txs.length);

      this.logger.log(
        `AI anomaly (${result.confidence}): ${result.summary}`,
      );
    } catch (e: any) {
      this.logger.warn(
        `Gemini batch analysis failed for ${pairKey}: ${e?.message}`,
      );
      onResult(null, batch.txs.length);
    }
  }

  private buildBatchPrompt(
    txs: { tx: NormalizedTransaction; usdValue: number; tokenLabel: string | undefined }[],
    wallet: WalletContext,
  ): string {
    const latest = txs[txs.length - 1];
    const fromLabel = this.labels.describe(latest.tx.from, wallet.fromTxCount);
    const toLabel = this.labels.describe(latest.tx.to ?? '', wallet.toTxCount);

    // Recent history for sender and recipient
    const senderHistory = this.buffer.getRecentForAddress(latest.tx.from, 5);
    const recipientHistory = latest.tx.to
      ? this.buffer.getRecentForAddress(latest.tx.to, 5)
      : [];

    const pairHistory = this.buffer.getRecentForPair(
      latest.tx.from,
      latest.tx.to,
      5,
    );

    const totalUsd = txs.reduce((sum, t) => sum + t.usdValue, 0);

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

    const txLines = txs
      .map(
        (t) =>
          `  - Hash: ${t.tx.txHash} | Value: ${t.tokenLabel ?? `${Number(t.tx.value) / 1e18} MNT`} (~$${t.usdValue.toLocaleString()})`,
      )
      .join('\n');

    return `System: You are an on-chain intelligence analyst for Mantle Network. You analyze transactions and wallet behavior to identify patterns. You have access to recent transaction history, entity labels, and wallet activity counts. Be concise, factual, and actionable. Never make buy/sell recommendations. Never hallucinate information not in the data.

Analyze the following transaction(s) for patterns and risk:

Sender: ${latest.tx.from} — ${fromLabel}
Recipient: ${latest.tx.to ?? 'Contract Deployment'} — ${toLabel}
Transactions in this batch: ${txs.length}
Total value: ~$${totalUsd.toLocaleString()}

Transaction details:
${txLines}
${historyBlock}

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
