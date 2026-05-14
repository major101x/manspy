import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createPublicClient, webSocket, fallback, http } from 'viem';
import { mantle } from 'viem/chains';

@Injectable()
export class MantleListenerService implements OnModuleInit {
  private readonly logger = new Logger(MantleListenerService.name);
  private client!: ReturnType<typeof createPublicClient>;

  constructor() {}

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

    this.client.watchPendingTransactions({
      onTransactions: (txs) => {
        for (const hash of txs) {
          this.logger.log(`Pending tx: ${hash}`);
        }
      },
    });

    this.client.watchBlocks({
      onBlock: (block) => {
        this.logger.log(`Block #${block.number} — ${block.transactions.length} txs`);
      },
    });
  }
}
