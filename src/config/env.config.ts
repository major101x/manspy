import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';

@Injectable()
export class EnvConfig {
  constructor(private config: ConfigService) {}

  get databaseUrl(): string {
    return this.config.get<string>('DATABASE_URL')!;
  }

  get redisUrl(): string {
    return this.config.get<string>('REDIS_URL')!;
  }

  get mantleRpcWss(): string {
    return this.config.get<string>('MANTLE_RPC_WSS')!;
  }

  get telegramBotToken(): string {
    return this.config.get<string>('TELEGRAM_BOT_TOKEN')!;
  }

  get claudeApiKey(): string | undefined {
    return this.config.get<string>('CLAUDE_API_KEY');
  }
}
