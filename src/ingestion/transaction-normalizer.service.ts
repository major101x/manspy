import { Injectable } from '@nestjs/common';

export interface NormalizedTransaction {
  txHash: string;
  from: string;
  to: string | null;
  value: bigint;
  gas: bigint;
  gasPrice: bigint;
  blockNumber: bigint | null;
  timestamp: number;
}

@Injectable()
export class TransactionNormalizerService {
  normalize(raw: any): NormalizedTransaction {
    return {
      txHash: raw.hash ?? raw.transactionHash,
      from: (raw.from ?? '').toLowerCase(),
      to: (raw.to ?? '').toLowerCase() || null,
      value: raw.value ? BigInt(raw.value) : 0n,
      gas: raw.gas ? BigInt(raw.gas) : 0n,
      gasPrice: raw.gasPrice ? BigInt(raw.gasPrice) : 0n,
      blockNumber: raw.blockNumber ? BigInt(raw.blockNumber) : null,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }
}
