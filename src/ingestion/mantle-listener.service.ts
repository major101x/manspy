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
      onBlock: async (block) => {
        if (block.transactions.length === 0) return;

        const price = await this.priceService.getMntUsd();
        if (price === 0) {
          this.logger.warn('Skipping block — no price data');
          return;
        }

        for (const hash of block.transactions) {
          const raw = await this.client.getTransaction({ hash }).catch(() => null);
          if (!raw) continue;

          const tx = this.normalizer.normalize(raw);
          const usdValue = Number(formatEther(tx.value)) * price;
          if (usdValue < 1) continue;

          await this.detection.processTx(tx, usdValue, (chatId, text) =>
            this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown' }),
          );
        }
      },
    });
  }
}
