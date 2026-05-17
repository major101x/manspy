import { Injectable, Logger } from '@nestjs/common';

interface RateLimitBucket {
  count: number;
  resetAt: number;
  notified: boolean;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly limit = 10;
  private readonly windowMs = 60 * 60 * 1000; // 1 hour
  private readonly buckets = new Map<string, RateLimitBucket>();

  check(userId: string): { allowed: boolean; remaining: number; resetInMinutes: number } {
    const now = Date.now();
    const bucket = this.buckets.get(userId);

    if (!bucket || now >= bucket.resetAt) {
      // New window
      this.buckets.set(userId, { count: 1, resetAt: now + this.windowMs, notified: false });
      return { allowed: true, remaining: this.limit - 1, resetInMinutes: 60 };
    }

    if (bucket.count >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        resetInMinutes: Math.ceil((bucket.resetAt - now) / 60000),
      };
    }

    bucket.count++;
    return {
      allowed: true,
      remaining: this.limit - bucket.count,
      resetInMinutes: Math.ceil((bucket.resetAt - now) / 60000),
    };
  }

  /** Returns true only the first time a user is notified in a given window. */
  markNotified(userId: string): boolean {
    const bucket = this.buckets.get(userId);
    if (!bucket || bucket.notified) return false;
    bucket.notified = true;
    return true;
  }

  getStatus(userId: string): { count: number; limit: number; resetInMinutes: number } {
    const bucket = this.buckets.get(userId);
    if (!bucket) return { count: 0, limit: this.limit, resetInMinutes: 0 };

    const now = Date.now();
    if (now >= bucket.resetAt) return { count: 0, limit: this.limit, resetInMinutes: 0 };

    return {
      count: bucket.count,
      limit: this.limit,
      resetInMinutes: Math.ceil((bucket.resetAt - now) / 60000),
    };
  }
}
