import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createPublicClient, webSocket, fallback, http, formatEther } from 'viem';
import { mantle } from 'viem/chains';
import { TransactionNormalizerService } from './transaction-normalizer.service';
import { TokenParserService } from './token-parser.service';
import { PriceService } from '../price/price.service';
import { DetectionService } from '../detection/detection.service';
import { TelegrafService } from '../bot/telegraf.service';

@Injectable()
export class MantleListenerService implements OnModuleInit {
  private readonly logger = new Logger(MantleListenerService.name);
  private client!: ReturnType<typeof createPublicClient>;

  constructor(
    private normalizer: TransactionNormalizerService,
    private tokenParser: TokenParserService,
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
        if (!header?.number) return;
        const full = await this.client.getBlock({ blockNumber: header.number, includeTransactions: true });
        if (full.transactions.length === 0) return;

        this.logger.log(`Block #${full.number} — ${full.transactions.length} txs`);
        const price = await this.priceService.getMntUsd();

        for (const tx of full.transactions) {
          if (typeof tx === 'string') continue;
          const normalized = this.normalizer.normalize(tx);
          let usdValue = Number(formatEther(normalized.value)) * price;
          let tokenLabel: string | undefined;
          let txDesc = `${normalized.txHash.slice(0, 10)}…`;

          if (usdValue === 0 && normalized.value === 0n) {
            const receipt = await this.client.getTransactionReceipt({ hash: normalized.txHash as `0x${string}` }).catch(() => null);
            if (receipt) {
              const summary = this.tokenParser.summarize(receipt);
              if (!summary.hasTransfer) {
                txDesc += ' contract call';
              } else {
                const parsed = this.tokenParser.parseReceipt(receipt);
                if (parsed) {
                  const tokenPrice = parsed.token === 'WMNT' ? price : parsed.token === 'WETH' ? 1800 : parsed.token === 'WBTC' ? 85000 : 1;
                  usdValue = parsed.amount * tokenPrice;
                  tokenLabel = `${parsed.amount.toLocaleString()} ${parsed.token}`;
                  txDesc += ` ${parsed.amount} ${parsed.token}`;
                } else {
                  const syms = summary.transfers.map(t => t.symbol ?? '?').join(',');
                  txDesc += ` unknown token (${syms})`;
                }
              }
            } else {
              txDesc += ' no receipt';
            }
          } else {
            txDesc += ` ${Number(formatEther(normalized.value)).toFixed(4)} MNT`;
          }

          await this.detection.processTx(normalized, usdValue, tokenLabel, (chatId, text, extra) =>
            this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown', ...extra }),
          );

          if (usdValue > 0) {
            this.logger.log(`  ✓ ${txDesc} ($${usdValue.toLocaleString()})`);
          } else {
            this.logger.log(`  • ${txDesc} ($0)`);
          }
        }
      },
    });
  }
}
