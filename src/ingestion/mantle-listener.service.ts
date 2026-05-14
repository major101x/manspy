import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createPublicClient, webSocket, fallback, http } from 'viem';
import { mantle } from 'viem/chains';
import { EnvConfig } from '../config/env.config';
import { TransactionNormalizerService } from './transaction-normalizer.service';

@Injectable()
export class MantleListenerService implements OnModuleInit {
  private readonly logger = new Logger(MantleListenerService.name);
  private client!: ReturnType<typeof createPublicClient>;
  private unwatchPending: (() => void) | null = null;

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
        webSocket(this.env.mantleRpcWss),
        http('https://rpc.mantle.xyz'),
      ]),
      pollingInterval: 4_000,
    });

    this.logger.log('Connected to Mantle RPC');

    this.unwatchPending = this.client.watchPendingTransactions({
      onTransactions: (txs) => {
        for (const hash of txs) {
          this.logger.verbose(`Pending tx: ${hash}`);
        }
      },
    });
  }
}
