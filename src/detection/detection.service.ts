import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { NormalizedTransaction } from '../ingestion/transaction-normalizer.service';

@Injectable()
export class DetectionService {
  private readonly logger = new Logger(DetectionService.name);

  constructor(private prisma: PrismaService) {}

  async processTx(tx: NormalizedTransaction, usdValue: number, sendAlert: (chatId: number, text: string) => Promise<any>) {
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
      const text = this.formatAlert(tx, usdValue, match.reason, label);
      await sendAlert(Number(match.user.telegramChatId), text).catch(e =>
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
    const explorer = `https://mantlescan.xyz/tx/${tx.txHash}`;
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
    lines.push(`From: \`${tx.from.slice(0, 10)}…${tx.from.slice(-4)}\``);
    lines.push(`To: \`${(tx.to ?? 'deploy').slice(0, 10)}…${(tx.to ?? '').slice(-4) || 'n/a'}\``);
    lines.push(`Value: ${mntValue.toLocaleString()} MNT ($${usdValue.toLocaleString()})`);
    lines.push('');
    lines.push(`🔗 [View on Explorer](${explorer})`);

    return lines.join('\n');
  }
}
