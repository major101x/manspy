import { Injectable, Logger } from '@nestjs/common';
import { decodeEventLog, getEventSelector, formatUnits } from 'viem';
import { TokenListService } from './token-list.service';

const TRANSFER_ABI = {
  type: 'event' as const,
  name: 'Transfer',
  inputs: [
    { indexed: true, name: 'from', type: 'address' },
    { indexed: true, name: 'to', type: 'address' },
    { indexed: false, name: 'value', type: 'uint256' },
  ],
};

export interface ParsedTransfer {
  token: string;
  amount: number;
  from: string;
  to: string;
  decimals: number;
}

export interface ReceiptSummary {
  hasTransfer: boolean;
  hasKnownTransfer: boolean;
  transfers: { address: string; symbol: string | null }[];
}

@Injectable()
export class TokenParserService {
  private readonly logger = new Logger(TokenParserService.name);
  private readonly transferSelector = getEventSelector('Transfer(address,address,address)');

  constructor(private tokenList: TokenListService) {}

  parseReceipt(receipt: any): ParsedTransfer | null {
    for (const log of receipt.logs) {
      if (log.topics?.[0] !== this.transferSelector) continue;

      const addr = (log.address ?? '').toLowerCase();
      const token = this.tokenList.lookup(addr);
      if (!token) continue;

      try {
        const decoded = decodeEventLog({
          abi: [TRANSFER_ABI],
          data: log.data,
          topics: log.topics,
        });

        const args = decoded.args as any;
        const amount = Number(formatUnits(args.value, token.decimals));
        if (amount <= 0) continue;

        return {
          token: token.symbol,
          amount,
          decimals: token.decimals,
          from: args.from.toLowerCase(),
          to: args.to.toLowerCase(),
        };
      } catch (e) {
        this.logger.verbose(`Failed to decode Transfer log for ${addr}: ${e}`);
      }
    }
    return null;
  }

  summarize(receipt: any): ReceiptSummary {
    const transfers: { address: string; symbol: string | null }[] = [];
    let hasTransfer = false;

    for (const log of receipt.logs) {
      if (log.topics?.[0] !== this.transferSelector) continue;
      hasTransfer = true;
      const addr = (log.address ?? '').toLowerCase();
      const token = this.tokenList.lookup(addr);
      transfers.push({ address: addr, symbol: token?.symbol ?? null });
    }

    return {
      hasTransfer,
      hasKnownTransfer: transfers.some(t => t.symbol !== null),
      transfers,
    };
  }
}
