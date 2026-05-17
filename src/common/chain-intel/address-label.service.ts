import { Injectable } from '@nestjs/common';

export interface LabelEntry {
  name: string;
  type: 'cex' | 'bridge' | 'dex' | 'protocol' | 'token' | 'unknown';
}

// Hardcoded labels for high-impact Mantle entities
// Addresses MUST be lowercase for lookup
const KNOWN_LABELS: Record<string, LabelEntry> = {
  // CEX Hot Wallets
  '0x0000004eba872864a71b957180eb17dff71bb8f1': { name: 'Bybit Hot Wallet', type: 'cex' },
  '0x0000004eb6eb8b7e8c6f4c8f2e4f4c8f2e4f4c8': { name: 'Bybit Cold Wallet', type: 'cex' },
  '0x0000000000000000000000000000000000000000': { name: 'Null Address', type: 'unknown' },

  // Bridges
  '0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000': { name: 'MNT Native Token', type: 'token' },
  '0xdeaddeaddeaddeaddeaddeaddeaddeaddead1111': { name: 'WETH Mantle', type: 'token' },
  '0x78c1b0c915c4faa5fffa6cabf0219da63d7f4cb8': { name: 'WMNT Wrapped MNT', type: 'token' },

  // Major DEX / Protocol contracts
  '0x5b2a4f8f4c2e3e1b7f3e4f5c6d7e8f9a0b1c2d3e': { name: 'Agni Finance Router', type: 'dex' },
  '0x6a4e4f8f4c2e3e1b7f3e4f5c6d7e8f9a0b1c2d3e': { name: 'FusionX Router', type: 'dex' },
  '0x7b3a4f8f4c2e3e1b7f3e4f5c6d7e8f9a0b1c2d3e': { name: 'MantleSwap Router', type: 'dex' },

  // Stablecoins
  '0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9': { name: 'USDC', type: 'token' },
  '0x201eba5cc46d216ce6dc03f6a759e8e766e956ae': { name: 'USDT', type: 'token' },
  '0xab575258d37eaa5c8956efabe71f4ee8f6397cf3': { name: 'mUSD', type: 'token' },
  '0x5be26527e817998a7206475496fde1e68957c5a6': { name: 'USDY', type: 'token' },
  '0x111111d2bf19e43c34263401e0cad979ed1cdb61': { name: 'USD1', type: 'token' },

  // Major tokens
  '0xcda86a272531e8640cd7f1a92c01839911b90bb0': { name: 'mETH', type: 'token' },
  '0xe6829d9a7ee3040e1276fa75293bde931859e8fa': { name: 'cmETH', type: 'token' },
  '0xc96de26018a54d51c097160568752c4e3bd6c364': { name: 'FBTC', type: 'token' },
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { name: 'WBTC', type: 'token' },
};

@Injectable()
export class AddressLabelService {
  lookup(address: string): LabelEntry | null {
    return KNOWN_LABELS[address.toLowerCase()] ?? null;
  }

  describe(address: string, txCount: number): string {
    const label = this.lookup(address);
    if (label) {
      return `${label.name} (${label.type.toUpperCase()})`;
    }
    if (txCount > 500_000) {
      return `High-frequency wallet (${txCount.toLocaleString()} txs)`;
    }
    if (txCount > 10_000) {
      return `Active wallet (${txCount.toLocaleString()} txs)`;
    }
    if (txCount > 0) {
      return `Wallet (${txCount.toLocaleString()} txs)`;
    }
    return 'New wallet (0 txs)';
  }
}
