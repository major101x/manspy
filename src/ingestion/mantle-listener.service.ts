import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createPublicClient, webSocket, fallback, http, formatEther } from 'viem';
import { mantle } from 'viem/chains';
import { TransactionNormalizerService } from './transaction-normalizer.service';
import { PriceService } from '../price/price.service';
import { DetectionService } from '../detection/detection.service';
import { TelegrafService } from '../bot/telegraf.service';

@Injectable()
export class MantleListenerService implements OnModuleInit {
  private readonly logger = new Logger(MantleListenerService.name);
  private client!: ReturnType<typeof createPublicClient>;

  constructor(
    private normalizer: TransactionNormalizerService,
    private priceService: PriceService,
    private detection: DetectionService,
    private bot: TelegrafService,
  ) {}

  async onModuleInit() {
    await this.connect();
  }

  private async connect() {
    this.client = createPublicClient({
      chain: mantle,
      transport: fallback([
        webSocket('wss://wss.mantle.xyz'),
        http('https://rpc.mantle.xyz'),
      ]),
    });

    this.logger.log('Connected to Mantle RPC');

    this.client.watchBlocks({
      onBlock: async (header) => {
        if (!header.number) return;
        const full = await this.client.getBlock({ blockNumber: header.number, includeTransactions: true });
        if (full.transactions.length === 0) return;

        const price = await this.priceService.getMntUsd();

        for (const tx of full.transactions) {
          if (typeof tx === 'string') continue;
          const normalized = this.normalizer.normalize(tx);
          const usdValue = Number(formatEther(normalized.value)) * price;

          await this.detection.processTx(normalized, usdValue, (chatId, text) =>
            this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown' }),
          );
        }
      },
    });
  }
}
