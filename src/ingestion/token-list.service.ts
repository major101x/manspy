import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

interface TokenEntry {
  symbol: string;
  decimals: number;
}

const FALLBACK_TOKENS: Record<string, TokenEntry> = {
  '0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9': { symbol: 'USDC', decimals: 6 },
  '0x201eba5cc46d216ce6dc03f6a759e8e766e956ae': { symbol: 'USDT', decimals: 6 },
  '0xdeaddeaddeaddeaddeaddeaddeaddeaddead1111': { symbol: 'WETH', decimals: 18 },
  '0x78c1b0c915c4faa5fffa6cabf0219da63d7f4cb8': { symbol: 'WMNT', decimals: 18 },
  '0xcda86a272531e8640cd7f1a92c01839911b90bb0': { symbol: 'mETH', decimals: 18 },
  '0xe6829d9a7ee3040e1276fa75293bde931859e8fa': { symbol: 'cmETH', decimals: 18 },
  '0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34': { symbol: 'USDe', decimals: 18 },
  '0x211cc4dd073734da055fbf44a2b4667d5e5fe5d2': { symbol: 'sUSDe', decimals: 18 },
  '0x58538e6a46e07434d7e7375bc268d3cb839c0133': { symbol: 'ENA', decimals: 18 },
  '0xab575258d37eaa5c8956efabe71f4ee8f6397cf3': { symbol: 'mUSD', decimals: 18 },
  '0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000': { symbol: 'MNT', decimals: 18 },
  '0x5be26527e817998a7206475496fde1e68957c5a6': { symbol: 'USDY', decimals: 18 },
  '0x111111d2bf19e43c34263401e0cad979ed1cdb61': { symbol: 'USD1', decimals: 18 },
  '0x8fe7176f0bf63358ad9490fd24ac0bdb4dac33a8': { symbol: 'USDLR', decimals: 6 },
  '0xc96de26018a54d51c097160568752c4e3bd6c364': { symbol: 'FBTC', decimals: 8 },
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', decimals: 8 },
  '0x0994206dfe8de6ec6920ff4d779b0d950605fb53': { symbol: 'crvUSD', decimals: 18 },
  '0x0a3bb08b3a15a19b4de82f8acfc862606fb69a2d': { symbol: 'iUSD', decimals: 18 },
  '0xd27b18915e7acc8fd6ac75db6766a80f8d2f5729': { symbol: 'PENDLE', decimals: 18 },
  '0x2db08783f13c4225a1963b2437f0d459a5bcb4d8': { symbol: 'UNI', decimals: 18 },
  '0x96630b0d78d29e7e8d87f8703de7c14b2d5ae413': { symbol: 'APEX', decimals: 18 },
  '0x49397ac9cb061152b770b1d274a5682155f20099': { symbol: 'SHIB', decimals: 18 },
  '0x8baf44b350ef672232a6673e1e128c7875640477': { symbol: 'PEPE', decimals: 18 },
  '0x23ee2343b892b1bb63503a4fabc840e0e2c6810f': { symbol: 'AXL', decimals: 6 },
  '0x35d48a789904e9b15705977192e5d95e2af7f1d3': { symbol: 'TRB', decimals: 18 },
  '0x6efff76acf1698a6a215eca7d632991678ec673b': { symbol: 'FLOKI', decimals: 9 },
  '0x9f0c013016e8656bc256f948cd4b79ab25c7b94d': { symbol: 'COOK', decimals: 18 },
  '0x52b7d8851d6ccbc6342ba0855be65f7b82a3f17f': { symbol: 'COMP', decimals: 18 },
  '0xf93a85d53e4af0d62bdf3a83ccfc1ecf3eaf9f32': { symbol: 'LUSD', decimals: 18 },
  '0xe265fc71d45fd791c9ebf3ee0a53fbb220eb8f75': { symbol: 'CRV', decimals: 18 },
  '0x3390108e913824b8ead638444cc52b9abdf63798': { symbol: 'BEL', decimals: 18 },
  '0x91824fc3573c5043837f6357b72f60014a710501': { symbol: 'APTR', decimals: 6 },
  '0xd0cf7dfbf09cafab8aef00e0ce19a4638004a364': { symbol: 'DODO', decimals: 18 },
  '0x056d4a69d243f176f6d1668722be386c3d50e27b': { symbol: 'EMBER', decimals: 18 },
  '0xfc88835694b1befe3506595303e37240f9d6a135': { symbol: 'IBEX', decimals: 18 },
  '0xa29b548056c3fd0f68bad9d4829ec4e66f22f796': { symbol: 'IDO', decimals: 18 },
  '0x6968f3f16c3e64003f02e121cf0d5ccbf5625a42': { symbol: 'IONX', decimals: 18 },
  '0x60d01ec2d5e98ac51c8b4cf84dfcce98d527c747': { symbol: 'IZI', decimals: 18 },
  '0x26a6b0dcdcfb981362afa56d581e4a7dba3be140': { symbol: 'PUFF', decimals: 18 },
  '0x3e65ac1dd4938e02301c4869d3043903f5deb474': { symbol: 'BabyDoge', decimals: 9 },
};

@Injectable()
export class TokenListService implements OnModuleInit {
  private readonly logger = new Logger(TokenListService.name);
  private tokens = new Map<string, TokenEntry>();
  private ready = false;

  async onModuleInit() {
    await this.fetch();
  }

  async fetch() {
    try {
      const res = await fetch('https://token-list.mantle.xyz/mantle.tokenlist.json');
      const json = await res.json() as any;

      for (const t of json.tokens ?? []) {
        if (t.chainId !== 5000) continue;
        this.tokens.set(t.address.toLowerCase(), { symbol: t.symbol, decimals: t.decimals });
      }

      this.logger.log(`Loaded ${this.tokens.size} tokens from Mantle token list`);
    } catch (e: any) {
      this.logger.warn(`Token list fetch failed, using fallback (${Object.keys(FALLBACK_TOKENS).length} tokens)`);
      for (const [addr, info] of Object.entries(FALLBACK_TOKENS)) {
        this.tokens.set(addr, info);
      }
    }

    this.ready = true;
  }

  lookup(address: string): TokenEntry | null {
    return this.tokens.get(address.toLowerCase()) ?? null;
  }

  isReady() {
    return this.ready;
  }
}
