import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createPublicClient, webSocket, fallback, http, formatEther } from 'viem';
import { mantle } from 'viem/chains';
import { BlockNotFoundError } from 'viem';
import { TransactionNormalizerService, NormalizedTransaction } from './transaction-normalizer.service';
import { TokenParserService } from './token-parser.service';
import { PriceService } from '../price/price.service';
import { DetectionService } from '../detection/detection.service';
import { AnomalyService, WalletContext } from '../anomaly/anomaly.service';
import { TelegrafService } from '../bot/telegraf.service';
import { AddressLabelService } from '../common/chain-intel/address-label.service';
import { RecentTxBufferService } from '../common/chain-intel/recent-tx-buffer.service';

@Injectable()
export class MantleListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MantleListenerService.name);
  private client!: ReturnType<typeof createPublicClient>;
  private unwatch: (() => void) | null = null;
  private stopped = false;

  constructor(
    private normalizer: TransactionNormalizerService,
    private tokenParser: TokenParserService,
    private priceService: PriceService,
    private detection: DetectionService,
    private anomaly: AnomalyService,
    private bot: TelegrafService,
    private labels: AddressLabelService,
    private buffer: RecentTxBufferService,
  ) {}

  async onModuleInit() {
    await this.connectWithRetry();
  }

  onModuleDestroy() {
    this.stopped = true;
    this.unwatch?.();
  }

  private async connectWithRetry(retries = 0) {
    try {
      await this.connect();
    } catch (e: any) {
      if (this.stopped) return;
      const delay = Math.min(1000 * 2 ** retries, 30000);
      this.logger.warn(`Connection failed (${e?.message}), retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      if (!this.stopped) await this.connectWithRetry(retries + 1);
    }
  }

  private async connect() {
    this.unwatch?.();

    this.client = createPublicClient({
      chain: mantle,
      transport: fallback([
        webSocket('wss://wss.mantle.xyz'),
        http('https://rpc.mantle.xyz'),
      ]),
    });

    this.logger.log('Connected to Mantle RPC');

    this.unwatch = this.client.watchBlocks({
      onBlock: async (header) => {
        try {
          if (!header?.number) return;

          let full;
          try {
            full = await this.client.getBlock({ blockNumber: header.number, includeTransactions: true });
          } catch (e) {
            if (e instanceof BlockNotFoundError) {
              this.logger.warn(`Block #${header.number} not found yet, skipping`);
              return;
            }
            throw e;
          }

          if (!full?.transactions?.length) return;

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

            const messageIds = await this.detection.processTx(normalized, usdValue, tokenLabel, (chatId, text, extra) =>
              this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown', ...extra }),
            );

            // Add to buffer for pattern analysis
            if (usdValue > 0) {
              this.buffer.add(normalized, usdValue, tokenLabel);
            }

            if (usdValue > 0 && messageIds.size > 0) {
              this.fireAnomalyCheck(normalized, usdValue, tokenLabel, messageIds)
                .catch((e: any) => this.logger.warn(`Anomaly check failed: ${e?.message}`));
            }

            if (usdValue > 0) {
              this.logger.log(`  ✓ ${txDesc} ($${usdValue.toLocaleString()})`);
            } else {
              this.logger.log(`  • ${txDesc} ($0)`);
            }
          }
        } catch (e: any) {
          this.logger.error(
            `Unhandled error processing block #${header?.number}: ${e?.message ?? e}`
          );
        }
      },
    });
  }

  private async fireAnomalyCheck(
    tx: NormalizedTransaction,
    usdValue: number,
    tokenLabel: string | undefined,
    messageIds: Map<string, { messageId: number; chatId: number; reason: string; text: string }>,
  ) {
    const wallet = await this.getWalletContext(tx);

    await this.anomaly.analyze(
      tx,
      usdValue,
      tokenLabel,
      wallet,
      messageIds,
      (result, batchSize) => {
        if (!result) return;

        const latestTxHash = tx.txHash;
        const safeSummary = result.summary.replace(/([*_[\]()~`#+=|{}.!-])/g, '\\$1');
        const aiBlock = `\n\n🤖 Pattern: ${result.pattern} | Risk: ${result.risk_level}\n${safeSummary}\n\n🔗 [View on Explorer](https://mantlescan.xyz/tx/${latestTxHash})`;

        for (const [, { chatId, messageId, text }] of messageIds) {
          // Skip if already edited
          if (text.includes('🤖 Pattern:')) continue;

          this.bot.telegram
            .editMessageText(chatId, messageId, undefined, text + aiBlock, {
              parse_mode: 'Markdown',
            })
            .catch((e: any) =>
              this.logger.warn(`Failed to edit alert: ${e?.message}`),
            );
        }
      },
    );
  }

  private async getWalletContext(tx: NormalizedTransaction): Promise<WalletContext> {
    try {
      const [currentBlock, fromTotal, toTotal] = await Promise.all([
        this.client.getBlockNumber(),
        this.client.getTransactionCount({ address: tx.from as `0x${string}` }),
        tx.to ? this.client.getTransactionCount({ address: tx.to as `0x${string}` }) : Promise.resolve(0),
      ]);

      const weekAgo = currentBlock - BigInt(300000);
      const [fromRecent, toRecent] = await Promise.all([
        this.client.getTransactionCount({ address: tx.from as `0x${string}`, blockNumber: weekAgo }),
        tx.to ? this.client.getTransactionCount({ address: tx.to as `0x${string}`, blockNumber: weekAgo }) : Promise.resolve(0),
      ]);

      return {
        fromTxCount: Number(fromTotal),
        toTxCount: Number(toTotal),
        fromRecentTxCount: Number(fromTotal - fromRecent),
        toRecentTxCount: Number(toTotal - toRecent),
      };
    } catch (e: any) {
      this.logger.warn(`Failed to fetch wallet context: ${e?.message}`);
      return { fromTxCount: 0, toTxCount: 0, fromRecentTxCount: 0, toRecentTxCount: 0 };
    }
  }
}
