import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createPublicClient, webSocket, fallback, http, formatEther } from 'viem';
import { mantle } from 'viem/chains';
import { EnvConfig } from '../config/env.config';
import { TransactionNormalizerService } from './transaction-normalizer.service';

@Injectable()
export class MantleListenerService implements OnModuleInit {
  private readonly logger = new Logger(MantleListenerService.name);
  private client!: ReturnType<typeof createPublicClient>;
  private unwatchPending: (() => void) | null = null;
  private unwatchBlocks: (() => void) | null = null;

  constructor(
    private env: EnvConfig,
    private normalizer: TransactionNormalizerService,
  ) {}

  async onModuleInit() {
    await this.connect();
  }

  private async connect() {
    this.client = createPublicClient({
      chain: mantle,
      transport: fallback([
        webSocket(this.env.mantleRpcWss, { timeout: 10_000 }),
        http('https://rpc.mantle.xyz'),
      ]),
      pollingInterval: 4_000,
    });

    this.logger.log('Connected to Mantle RPC');

    this.unwatchPending = this.client.watchPendingTransactions({
      onTransactions: (txs) => {
        for (const hash of txs) {
          this.logger.log(`Pending tx: ${hash}`);
        }
      },
    });

    this.unwatchBlocks = this.client.watchBlocks({
      onBlock: (block) => {
        this.logger.log(`Block #${block.number} — ${block.transactions.length} txs`);
      },
    });

    this.logger.log('Subscribed to pending transactions & new blocks');

    setInterval(async () => {
      try {
        const num = await this.client.getBlockNumber();
        const pending = await this.client.getBlock({ blockTag: 'pending' });
        const pendingCount = (pending.transactions as any[]).length;
        this.logger.log(`Live — current #${num}, pending: ${pendingCount}`);
      } catch (err: any) {
        this.logger.error(`Heartbeat failed: ${err?.message ?? err}`);
      }
    }, 15_000);
  }
}
