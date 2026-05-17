import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class PriceService {
  private readonly logger = new Logger(PriceService.name);
  private readonly cache: Redis | null;
  private readonly CACHE_KEY = 'price:mnt_usd';
  private readonly CACHE_TTL = 60;

  constructor() {
    const url = process.env.REDIS_URL;
    if (url) {
      this.cache = new Redis(url);
      this.cache.on('error', () => {});
    }
  }

  async getMntUsd(): Promise<number> {
    if (this.cache) {
      const cached = await this.cache.get(this.CACHE_KEY);
      if (cached) {
        return parseFloat(cached);
      }
    }

    try {
      const price = await this.fetchFromBybit();
      if (this.cache) await this.cache.set(this.CACHE_KEY, price.toString(), 'EX', this.CACHE_TTL);
      return price;
    } catch (err) {
      this.logger.warn('Bybit fetch failed, trying CoinGecko', err);
      try {
        const price = await this.fetchFromCoinGecko();
        if (this.cache) await this.cache.set(this.CACHE_KEY, price.toString(), 'EX', this.CACHE_TTL);
        return price;
      } catch (fallbackErr) {
        this.logger.error('All price sources failed', fallbackErr);
        return 0;
      }
    }
  }

  private async fetchFromBybit(): Promise<number> {
    const res = await fetch('https://api.bybit.com/v5/market/tickers?category=spot&symbol=MNTUSDT');
    if (!res.ok) throw new Error(`Bybit HTTP ${res.status}`);
    const data = await res.json();
    return parseFloat(data.result.list[0].lastPrice);
  }

  private async fetchFromCoinGecko(): Promise<number> {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=mantle&vs_currencies=usd';
    const headers: Record<string, string> = {};
    if (process.env.COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = await res.json();
    return data.mantle.usd;
  }
}
