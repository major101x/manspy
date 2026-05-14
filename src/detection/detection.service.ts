import { Injectable, Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import { PrismaService } from '../common/prisma/prisma.service';
import { NormalizedTransaction } from '../ingestion/transaction-normalizer.service';

@Injectable()
export class DetectionService {
  private readonly logger = new Logger(DetectionService.name);

  constructor(private prisma: PrismaService) {}

  async processTx(tx: NormalizedTransaction, usdValue: number, sendAlert: (chatId: number, text: string, extra?: any) => Promise<any>) {
    const [thresholdUsers, trackedMatches] = await Promise.all([
      this.prisma.user.findMany({ where: { alertsEnabled: true, thresholdUsd: { lte: usdValue } } }),
      this.prisma.trackedWallet.findMany({
        where: { address: { in: [tx.from, tx.to ?? ''] } },
        include: { user: true },
      }),
    ]);

    const matched = new Map<string, { user: { id: string; telegramChatId: bigint }; reason: string }>();

    for (const u of thresholdUsers) {
      matched.set(u.id, { user: { id: u.id, telegramChatId: u.telegramChatId }, reason: 'whale' });
    }

    for (const w of trackedMatches) {
      const existing = matched.get(w.user.id);
      const reasons = existing ? [existing.reason, 'tracked'] : ['tracked'];
      matched.set(w.user.id, {
        user: { id: w.user.id, telegramChatId: w.user.telegramChatId },
        reason: reasons.includes('whale') ? 'whale+tracked' : 'tracked',
      });
    }

    for (const [, match] of matched) {
      const label = trackedMatches.find(w => w.user.id === match.user.id)?.label;
      const isTracking = trackedMatches.some(w => w.user.id === match.user.id);
      const text = this.formatAlert(tx, usdValue, match.reason, label);

      const buttons: any[] = [];
      if (isTracking) {
        buttons.push(Markup.button.callback('❌ Unwatch', `unwatch:${tx.from}`));
      } else {
        buttons.push(Markup.button.callback('👀 Watch', `watch:${tx.from}`));
      }
      buttons.push(Markup.button.url('🔗 Explorer', `https://mantlescan.xyz/tx/${tx.txHash}`));
      const kb = Markup.inlineKeyboard([buttons]);

      await sendAlert(Number(match.user.telegramChatId), text, kb).catch(e =>
        this.logger.warn(`Failed to send alert to ${match.user.telegramChatId}: ${e?.message}`),
      );

      await this.prisma.alertLog.create({
        data: {
          userId: match.user.id,
          txHash: tx.txHash,
          type: match.reason,
          message: text,
        },
      }).catch(e => this.logger.warn(`Failed to log alert: ${e?.message}`));
    }
  }

  private formatAlert(tx: NormalizedTransaction, usdValue: number, reason: string, label?: string): string {
    const mntValue = Number(tx.value) / 1e18;
    const lines: string[] = [];

    if (reason === 'tracked' && label) {
      lines.push(`👀 Wallet Alert — "${label}"`);
    } else if (reason === 'whale' || reason === 'whale+tracked') {
      lines.push('🚨 Whale Alert');
    } else {
      lines.push('🚨 Alert');
    }

    lines.push('');
    lines.push(`From: \`${tx.from}\``);
    lines.push(`To: \`${tx.to ?? 'deploy'}\``);
    lines.push(`Value: ${mntValue.toLocaleString()} MNT ($${usdValue.toLocaleString()})`);

    return lines.join('\n');
  }
}
