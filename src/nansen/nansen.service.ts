import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import {
  NansenAddressEnrichment,
  NansenCurrentBalanceResponse,
  NansenPnLSummaryResponse,
  NansenTransactionsResponse,
} from './nansen.types';

@Injectable()
export class NansenService {
  private readonly logger = new Logger(NansenService.name);
  private readonly baseUrl = 'https://api.nansen.ai/api/v1';
  private readonly apiKey: string;
  private readonly cache: Redis | null;
  private readonly CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
  private disabledUntil = 0;

  constructor() {
    this.apiKey = process.env.NANSEN_API_KEY || '';
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      this.cache = new Redis(redisUrl);
      this.cache.on('error', () => {});
    }
  }

  async enrichAddress(address: string): Promise<NansenAddressEnrichment | null> {
    if (!this.apiKey) {
      return null;
    }

    if (Date.now() < this.disabledUntil) {
      this.logger.warn('Nansen temporarily disabled due to previous errors');
      return null;
    }

    const cacheKey = `nansen:${address.toLowerCase()}`;

    // Check cache
    if (this.cache) {
      try {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          const parsed: NansenAddressEnrichment = JSON.parse(cached);
          this.logger.log(`Nansen cache hit for ${address.slice(0, 12)}…`);
          return parsed;
        }
      } catch {
        // cache miss or parse error, continue
      }
    }

    try {
      const [currentBalance, pnlSummary, transactions] = await Promise.all([
        this.fetchCurrentBalance(address),
        this.fetchPnLSummary(address),
        this.fetchTransactions(address),
      ]);

      const enrichment: NansenAddressEnrichment = {
        address,
        chain: 'mantle',
        currentBalance,
        pnlSummary,
        transactions,
        cachedAt: Date.now(),
      };

      // Cache result
      if (this.cache) {
        await this.cache.set(cacheKey, JSON.stringify(enrichment), 'EX', this.CACHE_TTL_SECONDS);
      }

      this.logger.log(`Nansen enriched ${address.slice(0, 12)}… — ${currentBalance?.data?.length ?? 0} tokens`);
      return enrichment;
    } catch (error: any) {
      this.logger.warn(`Nansen enrichment failed for ${address.slice(0, 12)}…: ${error?.message}`);
      
      // Disable for 1 hour on repeated errors
      if (error?.message?.includes('429') || error?.message?.includes('Payment required')) {
        this.disabledUntil = Date.now() + 60 * 60 * 1000;
        this.logger.warn('Nansen disabled for 1 hour due to rate limit or payment error');
      }

      return null;
    }
  }

  private async fetchCurrentBalance(address: string): Promise<NansenCurrentBalanceResponse | null> {
    return this.call<NansenCurrentBalanceResponse>('/profiler/address/current-balance', {
      address,
      chain: 'mantle',
      hide_spam_token: true,
      pagination: { page: 1, per_page: 10 },
    });
  }

  private async fetchPnLSummary(address: string): Promise<NansenPnLSummaryResponse | null> {
    return this.call<NansenPnLSummaryResponse>('/profiler/address/pnl-summary', {
      address,
      chain: 'mantle',
    });
  }

  private async fetchTransactions(address: string): Promise<NansenTransactionsResponse | null> {
    return this.call<NansenTransactionsResponse>('/profiler/address/transactions', {
      address,
      chain: 'mantle',
      pagination: { page: 1, per_page: 5 },
    });
  }

  private async call<T>(path: string, body: unknown): Promise<T | null> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apiKey': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Nansen ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }
}
