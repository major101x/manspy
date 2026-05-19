import { Controller, Post, Get, Body } from '@nestjs/common';
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
  constructor(
    private detection: DetectionService,
    private anomaly: AnomalyService,
    private bot: TelegrafService,
    private buffer: RecentTxBufferService,
  ) {}

  @Post('alert')
  async testAlert(@Body() dto: TestAlertDto) {
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

    this.buffer.add(fakeTx, usdValue, tokenLabel);

    const messageIds = await this.detection.processTx(
      fakeTx,
      usdValue,
      tokenLabel,
      (chatId, text, extra) =>
        this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'Markdown', ...extra }),
    );

    if (messageIds.size > 0) {
      const wallet = {
        fromTxCount: 1200000,
        toTxCount: 0,
        fromRecentTxCount: 50,
        toRecentTxCount: 0,
      };
      this.anomaly
        .analyze(fakeTx, usdValue, tokenLabel, wallet, messageIds, (result, _batchSize) => {
          if (!result) return;

          const aiBlock = `\n\n🤖 Pattern: ${result.pattern} | Risk: ${result.risk_level}\n${result.summary}\n\n🔗 [View on Explorer](https://mantlescan.xyz/tx/${fakeTx.txHash})`;

          for (const [, { chatId, messageId, text }] of messageIds) {
            if (text.includes('🤖 Pattern:')) continue;

            this.bot.telegram
              .editMessageText(chatId, messageId, undefined, text + aiBlock, {
                parse_mode: 'Markdown',
              })
              .catch((e: any) => console.error('Failed to edit alert:', e?.message));
          }
        })
        .catch((e) => console.error('Anomaly check failed:', e));
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
    return this.anomaly.getRecentResults(5);
  }
}
