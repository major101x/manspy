import { Injectable, Logger } from '@nestjs/common';
import { decodeEventLog, getEventSelector, formatUnits } from 'viem';

const TRANSFER_ABI = {
  type: 'event' as const,
  name: 'Transfer',
  inputs: [
    { indexed: true, name: 'from', type: 'address' },
    { indexed: true, name: 'to', type: 'address' },
    { indexed: false, name: 'value', type: 'uint256' },
  ],
};

const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  '0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9': { symbol: 'USDC', decimals: 6 },
  '0x201eba5cc46d216ce6dc03f6a759e8e766e956ae': { symbol: 'USDT', decimals: 6 },
  '0xdeaddeaddeaddeaddeaddeaddeaddeaddead1111': { symbol: 'WETH', decimals: 18 },
  '0x78c1b0c915c4faa5fffa6cabf0219da63d7f4cb8': { symbol: 'WMNT', decimals: 18 },
};

export interface ParsedTransfer {
  token: string;
  amount: number;
  from: string;
  to: string;
}

@Injectable()
export class TokenParserService {
  private readonly logger = new Logger(TokenParserService.name);
  private readonly transferSelector = getEventSelector('Transfer(address,address,address)');

  parseReceipt(receipt: any): ParsedTransfer | null {
    for (const log of receipt.logs) {
      if (log.topics?.[0] !== this.transferSelector) continue;

      const addr = (log.address ?? '').toLowerCase();
      const token = KNOWN_TOKENS[addr];
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

        return { token: token.symbol, amount, from: args.from.toLowerCase(), to: args.to.toLowerCase() };
      } catch (e) {
        this.logger.verbose(`Failed to decode Transfer log for ${addr}: ${e}`);
      }
    }
    return null;
  }
}
