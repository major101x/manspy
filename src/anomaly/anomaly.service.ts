import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { NormalizedTransaction } from '../ingestion/transaction-normalizer.service';

export interface WalletContext {
  fromTxCount: number;
  toTxCount: number;
  fromRecentTxCount: number;
  toRecentTxCount: number;
}

export interface AnomalyResult {
  anomaly: boolean;
  explanation: string;
  confidence: number;
}

@Injectable()
export class AnomalyService {
  private readonly logger = new Logger(AnomalyService.name);
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }

  async analyze(
    tx: NormalizedTransaction,
    usdValue: number,
    tokenLabel: string | undefined,
    wallet: WalletContext,
  ): Promise<AnomalyResult | null> {
    const prompt = this.buildPrompt(tx, usdValue, tokenLabel, wallet);

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      return JSON.parse(response.text ?? '{}');
    } catch (e: any) {
      this.logger.warn(`Gemini analysis failed: ${e?.message}`);
      return null;
    }
  }

  private buildPrompt(tx: NormalizedTransaction, usdValue: number, tokenLabel: string | undefined, wallet: WalletContext): string {
    const valueStr = tokenLabel ?? `${Number(tx.value) / 1e18} MNT`;
    const fromInactiveDays = this.estimateInactiveDays(wallet.fromTxCount, wallet.fromRecentTxCount);
    const toInactiveDays = this.estimateInactiveDays(wallet.toTxCount, wallet.toRecentTxCount);

    return `System: You are an on-chain intelligence analyst specializing in Mantle blockchain activity. You analyze transactions and wallet behavior to identify patterns that may be significant to traders and DeFi participants. Be concise, factual, and actionable. Never make buy/sell recommendations. Focus on describing what happened and what pattern it matches, not what the user should do.

User:
Analyze this Mantle transaction for anomalies:

Transaction: ${tx.txHash}
From: ${tx.from} (total txs: ${wallet.fromTxCount}, last active: ~${fromInactiveDays})
To: ${tx.to ?? 'contract deploy'} (total txs: ${wallet.toTxCount}, last active: ~${toInactiveDays})
Value: ${valueStr} (~$${usdValue.toLocaleString()})

Recent activity (last 7 days):
Sender: ${wallet.fromRecentTxCount} transactions
Receiver: ${wallet.toRecentTxCount} transactions

Is this transaction anomalous? If yes, explain why in 2-3 sentences in plain English. If no, say "No anomaly detected."

Respond in JSON: { "anomaly": true|false, "explanation": "...", "confidence": 0.0-1.0 }`;
  }

  private estimateInactiveDays(totalTx: number, recentTx: number): string {
    if (totalTx === 0) return 'never active';
    if (recentTx > 0) return '< 7 days';
    return '> 7 days';
  }
}
