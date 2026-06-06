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

interface SeedFlowsDto {
  // Multiplier on the default USD amounts, e.g. 2 doubles every leg. Default 1.
  scale?: number;
}

// Bybit Hot Wallet — labeled 'cex' in AddressLabelService
const BYBIT = '0x0000004eba872864a71b957180eb17dff71bb8f1';
// Synthetic counterparty wallets (lowercase, as the normalizer produces)
const W = (n: number) =>
  `0x${n.toString(16).padStart(40, '0')}` as string;

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

          const aiBlock = `\n\n🤖 Pattern: ${result.pattern} | Risk: ${result.risk_level}\n${result.summary}\n\n🔗 https://mantlescan.xyz/tx/${fakeTx.txHash}`;

          for (const [, { chatId, messageId, text }] of messageIds) {
            if (text.includes('🤖 Pattern:')) continue;

            this.logger.log(`[TEST] Editing Telegram message ${messageId} for chatId=${chatId}`);
            this.bot.telegram
              .editMessageText(chatId, messageId, undefined, text + aiBlock)
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

  @Post('seed-flows')
  seedFlows(@Body() dto: SeedFlowsDto) {
    const s = dto?.scale && dto.scale > 0 ? dto.scale : 1;
    this.logger.log(`[TEST] Seeding flow buffer (scale=${s})`);

    // Scenario:
    //  - Bybit withdraws to 4 distinct fresh wallets → distribution wave + $87K outflow
    //  - 1 deposit back into Bybit → $30K inflow (sell-side)
    //  - W(1) also receives a second inbound → top accumulator
    // Net CEX flow = 87K out − 30K in = +57K (net withdrawal / accumulation signal)
    const legs: Array<{ from: string; to: string; usd: number }> = [
      { from: BYBIT, to: W(1), usd: 42000 },
      { from: BYBIT, to: W(2), usd: 21000 },
      { from: BYBIT, to: W(3), usd: 15000 },
      { from: BYBIT, to: W(4), usd: 9000 },
      { from: W(5), to: BYBIT, usd: 30000 }, // deposit (inflow)
      { from: W(6), to: W(1), usd: 20000 }, // W(1) accumulates further
    ];

    let i = 0;
    for (const leg of legs) {
      const usd = Math.round(leg.usd * s);
      const tx: NormalizedTransaction = {
        txHash: `0xseed${Date.now().toString(16)}${(i++).toString(16)}`,
        from: leg.from,
        to: leg.to,
        value: 0n,
        gas: 21000n,
        gasPrice: 1000000000n,
        blockNumber: 12345678n,
        timestamp: Math.floor(Date.now() / 1000),
      };
      this.buffer.add(tx, usd, `${(usd / 0.65).toFixed(0)} MNT`);
    }

    this.logger.log(`[TEST] Seeded ${legs.length} flow legs into buffer`);
    return {
      status: 'seeded',
      legs: legs.length,
      scale: s,
      note: 'Send /flows in Telegram to see the digest.',
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
