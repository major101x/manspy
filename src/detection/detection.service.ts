import { Injectable, Logger } from '@nestjs/common';
import { Markup } from 'telegraf';
import { PrismaService } from '../common/prisma/prisma.service';
import { NormalizedTransaction } from '../ingestion/transaction-normalizer.service';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class DetectionService {
  private readonly logger = new Logger(DetectionService.name);

  constructor(
    private prisma: PrismaService,
    private rateLimit: RateLimitService,
  ) {}

  async processTx(tx: NormalizedTransaction, usdValue: number, tokenLabel: string | undefined, sendAlert: (chatId: number, text: string, extra?: any) => Promise<any>): Promise<Map<string, { messageId: number; chatId: number; reason: string; text: string }>> {
    const [thresholdUsers, trackedMatches] = await Promise.all([
      this.prisma.user.findMany({ where: { alertsEnabled: true, thresholdUsd: { lte: usdValue } } }),
      this.prisma.trackedWallet.findMany({
        where: { address: { in: [tx.from, tx.to ?? ''] } },
        include: { user: true },
      }),
    ]);

    const messageIds = new Map<string, { messageId: number; chatId: number; reason: string; text: string }>();

    if (thresholdUsers.length === 0 && trackedMatches.length === 0) {
      if (usdValue > 0) this.logger.log(`No users match tx ${tx.txHash.slice(0, 10)}… ($${usdValue.toLocaleString()})`);
      return messageIds;
    }

    const matched = new Map<string, { user: { id: string; telegramChatId: bigint }; reason: string }>();

    for (const u of thresholdUsers) {
      matched.set(u.id, { user: { id: u.id, telegramChatId: u.telegramChatId }, reason: 'whale' });
    }

    for (const w of trackedMatches) {
      const existing = matched.get(w.user.id);
      matched.set(w.user.id, {
        user: { id: w.user.id, telegramChatId: w.user.telegramChatId },
        reason: existing ? 'whale+tracked' : 'tracked',
      });
    }

    for (const [, match] of matched) {
      const rateCheck = this.rateLimit.check(match.user.id);
      if (!rateCheck.allowed) {
        if (this.rateLimit.markNotified(match.user.id)) {
          await sendAlert(
            Number(match.user.telegramChatId),
            `⏳ Rate limit: 10 alerts/hour reached. Resets in ${rateCheck.resetInMinutes}min. Use /status to check your limit.`,
            {},
          ).catch((e) => this.logger.warn(`Failed to send rate limit msg: ${e?.message}`));
        }
        this.logger.log(`Rate limited user ${match.user.id}`);
        continue;
      }

      const label = trackedMatches.find(w => w.user.id === match.user.id)?.label;
      const text = this.formatAlert(tx, usdValue, tokenLabel, match.reason, label);

      const buttons: any[] = [];
      if (trackedMatches.some(w => w.user.id === match.user.id)) {
        buttons.push(Markup.button.callback('❌ Unwatch', `unwatch:${tx.from}`));
      } else {
        buttons.push(Markup.button.callback('👀 Watch', `watch:${tx.from}`));
      }
      buttons.push(Markup.button.url('🔗 Explorer', `https://mantlescan.xyz/tx/${tx.txHash}`));
      const kb = Markup.inlineKeyboard([buttons]);

      const msg = await sendAlert(Number(match.user.telegramChatId), text, kb).catch(e => {
        this.logger.warn(`Failed to send alert to ${match.user.telegramChatId}: ${e?.message}`);
        return null;
      });
      if (msg?.message_id) messageIds.set(match.user.id, { messageId: msg.message_id, chatId: Number(match.user.telegramChatId), reason: match.reason, text });

      await this.prisma.alertLog.create({
        data: { userId: match.user.id, txHash: tx.txHash, type: match.reason, message: text },
      }).catch(e => this.logger.warn(`Failed to log alert: ${e?.message}`));
    }

    return messageIds;
  }

  private formatAlert(tx: NormalizedTransaction, usdValue: number, tokenLabel: string | undefined, reason: string, label?: string): string {
    const lines: string[] = [];

    if (reason === 'tracked' && label) {
      lines.push(`👀 Wallet Alert — "${label}"`);
    } else {
      lines.push('🚨 Whale Alert');
    }

    lines.push('');
    lines.push(`From: \`${tx.from}\``);
    lines.push(`To: \`${tx.to ?? 'deploy'}\``);

    if (tokenLabel) {
      lines.push(`Value: ${tokenLabel} ($${usdValue.toLocaleString()})`);
    } else {
      lines.push(`Value: ${(Number(tx.value) / 1e18).toLocaleString()} MNT ($${usdValue.toLocaleString()})`);
    }

    return lines.join('\n');
  }
}
