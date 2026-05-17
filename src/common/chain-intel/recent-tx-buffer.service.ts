import { Injectable } from '@nestjs/common';
import { NormalizedTransaction } from '../../ingestion/transaction-normalizer.service';

interface BufferedTx {
  tx: NormalizedTransaction;
  usdValue: number;
  tokenLabel: string | undefined;
  timestamp: number;
}

@Injectable()
export class RecentTxBufferService {
  private readonly maxSize = 200;
  private buffer: BufferedTx[] = [];

  add(tx: NormalizedTransaction, usdValue: number, tokenLabel: string | undefined) {
    this.buffer.push({ tx, usdValue, tokenLabel, timestamp: Date.now() });
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  getRecentForAddress(address: string, limit = 10): BufferedTx[] {
    const lower = address.toLowerCase();
    return this.buffer
      .filter(
        (b) =>
          b.tx.from.toLowerCase() === lower ||
          (b.tx.to ?? '').toLowerCase() === lower,
      )
      .slice(-limit);
  }

  getRecentForPair(from: string, to: string | null, limit = 10): BufferedTx[] {
    const f = from.toLowerCase();
    const t = (to ?? '').toLowerCase();
    return this.buffer
      .filter(
        (b) =>
          b.tx.from.toLowerCase() === f &&
          (b.tx.to ?? '').toLowerCase() === t,
      )
      .slice(-limit);
  }

  getAll(): BufferedTx[] {
    return [...this.buffer];
  }
}
