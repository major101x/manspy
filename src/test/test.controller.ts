import { Controller, Post, Get, Body, Logger } from '@nestjs/common';
import { DetectionService } from '../detection/detection.service';
import { AnomalyService } from '../anomaly/anomaly.service';
import { TelegrafService } from '../bot/telegraf.service';
import { RecentTxBufferService } from '../common/chain-intel/recent-tx-buffer.service';
import { NormalizedTransaction } from '../ingestion/transaction-normalizer.service';

interface TestAlertDto {
  chatId: number;
  to?: string;
  usdValue?: number;
  tokenLabel?: string;
}

@Controller('test')
export class TestController {
  private readonly logger = new Logger(TestController.name);

  constructor(
    private detection: DetectionService,
    private anomaly: AnomalyService,
    private bot: TelegrafService,
    private buffer: RecentTxBufferService,
  ) {}

  @Post('alert')
  async testAlert(@Body() dto: TestAlertDto) {
    this.logger.log(`[TEST] Received test alert request for chatId=${dto.chatId}, usdValue=${dto.usdValue ?? 7500}`);

    const fakeTx: NormalizedTransaction = {
      txHash: `0xtest${Date.now().toString(16)}`,
      from: '0x0000004eba872864a71b957180eb17dff71bb8f1',
      to: dto.to ?? '0x88a8984f2b8507bbc1c699594e3a4ecdefed4784',
      value: 0n,
      gas: 21000n,
      gasPrice: 1000000000n,
      blockNumber: 12345678n,
      timestamp: Math.floor(Date.now() / 1000),
    };

    const usdValue = dto.usdValue ?? 7500;
    const tokenLabel = dto.tokenLabel ?? `${(usdValue / 0.65).toFixed(2)} MNT`;

    this.logger.log(`[TEST] Injecting fake tx ${fakeTx.txHash} | value=$${usdValue} | pair=${fakeTx.from}:${fakeTx.to}`);

    this.buffer.add(fakeTx, usdValue, tokenLabel);
    this.logger.log(`[TEST] Added tx to buffer`);

    const messageIds = await this.detection.processTx(
      fakeTx,
      usdValue,
      tokenLabel,
      (chatId, text, extra) => {
        this.logger.log(`[TEST] Sending Telegram alert to chatId=${chatId}`);
        return this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown', ...extra });
      },
    );

    this.logger.log(`[TEST] Detection matched ${messageIds.size} user(s)`);

    if (messageIds.size > 0) {
      const wallet = {
        fromTxCount: 1200000,
        toTxCount: 0,
        fromRecentTxCount: 50,
        toRecentTxCount: 0,
      };
      this.logger.log(`[TEST] Firing anomaly check for tx ${fakeTx.txHash}`);
      this.anomaly
        .analyze(fakeTx, usdValue, tokenLabel, wallet, messageIds, (result, batchSize) => {
          if (!result) {
            this.logger.log(`[TEST] Anomaly returned null for tx ${fakeTx.txHash} (batchSize=${batchSize})`);
            return;
          }

          this.logger.log(`[TEST] Anomaly result for tx ${fakeTx.txHash}: pattern=${result.pattern}, risk=${result.risk_level}, confidence=${result.confidence}, batchSize=${batchSize}`);

          const safeSummary = result.summary.replace(/([[\]()])/g, '\\$1');
          const aiBlock = `\n\n🤖 Pattern: ${result.pattern} | Risk: ${result.risk_level}\n${safeSummary}\n\n🔗 [View on Explorer](https://mantlescan.xyz/tx/${fakeTx.txHash})`;

          for (const [, { chatId, messageId, text }] of messageIds) {
            if (text.includes('🤖 Pattern:')) continue;

            this.logger.log(`[TEST] Editing Telegram message ${messageId} for chatId=${chatId}`);
            this.bot.telegram
              .editMessageText(chatId, messageId, undefined, text + aiBlock, {
                parse_mode: 'Markdown',
              })
              .catch((e: any) => this.logger.error(`[TEST] Failed to edit alert: ${e?.message}`));
          }
        })
        .catch((e) => this.logger.error(`[TEST] Anomaly check failed: ${e?.message}`));
    } else {
      this.logger.warn(`[TEST] No users matched tx ${fakeTx.txHash}. Check threshold (${usdValue}) and tracked wallets.`);
    }

    return {
      status: 'injected',
      txHash: fakeTx.txHash,
      expectedAlerts: messageIds.size,
      targetChatId: dto.chatId,
      note: 'Check Telegram and wait up to 3min for AI analysis',
    };
  }

  @Get('last-anomaly')
  getLastAnomalies() {
    this.logger.log(`[TEST] GET /test/last-anomaly requested`);
    const results = this.anomaly.getRecentResults(5);
    this.logger.log(`[TEST] Returning ${results.length} anomaly result(s)`);
    return results;
  }
}
