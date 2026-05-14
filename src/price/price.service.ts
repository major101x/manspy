import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class PriceService {
  private readonly logger = new Logger(PriceService.name);
  private readonly cache: Redis;
  private readonly CACHE_KEY = 'price:mnt_usd';
  private readonly CACHE_TTL = 60;

  constructor() {
    this.cache = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  }

  async getMntUsd(): Promise<number> {
    const cached = await this.cache.get(this.CACHE_KEY);
    if (cached) {
      return parseFloat(cached);
    }

    try {
      const price = await this.fetchFromBybit();
        await this.cache.set(this.CACHE_KEY, price.toString(), 'EX', this.CACHE_TTL);
      return price;
    } catch (err) {
      this.logger.warn('Bybit fetch failed, trying CoinGecko', err);
      try {
        const price = await this.fetchFromCoinGecko();
      await this.cache.set(this.CACHE_KEY, price.toString(), 'EX', this.CACHE_TTL);
        return price;
      } catch (fallbackErr) {
        this.logger.error('All price sources failed', fallbackErr);
        return 0;
      }
    }
  }

  private async fetchFromBybit(): Promise<number> {
    const res = await fetch('https://api.bytick.com/v5/market/tickers?category=spot&symbol=MNTUSDT');
    const data = await res.json();
    return parseFloat(data.result.list[0].lastPrice);
  }

  private async fetchFromCoinGecko(): Promise<number> {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=mantle&vs_currencies=usd',
      { headers: process.env.COINGECKO_API_KEY ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY } : undefined },
    );
    const data = await res.json();
    return data.mantle.usd;
  }
}
