import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { isAddress } from 'viem';
import { UserService } from './user.service';
import { RateLimitService } from '../detection/rate-limit.service';

@Injectable()
export class TelegrafService extends Telegraf implements OnModuleDestroy {
  private readonly logger = new Logger(TelegrafService.name);

  constructor(
    config: ConfigService,
    private userService: UserService,
    private rateLimit: RateLimitService,
  ) {
    super(config.get<string>('TELEGRAM_BOT_TOKEN')!);

    this.start(async (ctx) => {
      await this.userService.findOrCreate(BigInt(ctx.chat.id));
      await ctx.reply(
        '👋 Welcome to ManSpy!\n\n'
        + 'I monitor Mantle Network for whale movements and on-chain anomalies.\n\n'
        + 'Commands:\n'
        + '/watch <address> <label> — track a wallet\n'
        + '/unwatch <address> — stop tracking\n'
        + '/list — show tracked wallets\n'
        + '/threshold <usd> — set minimum alert value\n'
        + '/alerts on|off — toggle alerts\n'
        + '/status — your settings\n'
        + '/help — this message',
      );
    });

    this.help(async (ctx) => {
      await ctx.reply(
        'Commands:\n'
        + '/start — welcome & onboarding\n'
        + '/watch <address> <label> — register a wallet to track\n'
        + '/unwatch <address> — stop tracking a wallet\n'
        + '/list — show all tracked wallets\n'
        + '/alerts on|off — toggle all alerts\n'
        + '/threshold <usd_amount> — set minimum USD value to alert on (default $50,000)\n'
        + '/status — show bot status and your current settings\n'
        + '/help — command reference',
      );
    });

    this.command('status', async (ctx) => {
      const user = await this.userService.findOrCreate(BigInt(ctx.chat.id));
      const wallets = await this.userService.getTrackedWallets(BigInt(ctx.chat.id));
      const rate = this.rateLimit.getStatus(user.id);
      await ctx.reply(
        `📊 Your Settings\n\n`
        + `Alerts: ${user.alertsEnabled ? '✅ On' : '❌ Off'}\n`
        + `Threshold: $${user.thresholdUsd.toLocaleString()}\n`
        + `Tracked wallets: ${wallets.length}\n`
        + `Rate limit: ${rate.count}/${rate.limit} this hour`
        + (rate.resetInMinutes > 0 ? ` (resets in ${rate.resetInMinutes}min)` : ''),
      );
    });

    this.command('watch', async (ctx) => {
      const text = ctx.message.text;
      const parts = text.split(/\s+/);
      if (parts.length < 2 || !isAddress(parts[1])) {
        return ctx.reply('Usage: /watch <address> <label>\nExample: /watch 0x1234...5678 Binance Hot Wallet');
      }
      const address = parts[1];
      const label = parts.slice(2).join(' ') || 'Untitled';
      await this.userService.addWatch(BigInt(ctx.chat.id), address, label);
      await ctx.reply(`✅ Now tracking \`${address}\` — ${label}`, { parse_mode: 'Markdown' });
    });

    this.command('unwatch', async (ctx) => {
      const text = ctx.message.text;
      const parts = text.split(/\s+/);
      if (parts.length < 2 || !isAddress(parts[1])) {
        return ctx.reply('Usage: /unwatch <address>\nExample: /unwatch 0x1234...5678');
      }
      const removed = await this.userService.removeWatch(BigInt(ctx.chat.id), parts[1]);
      if (!removed) return ctx.reply('That address is not in your watch list.');
      await ctx.reply(`⏹ Stopped tracking \`${parts[1]}\``, { parse_mode: 'Markdown' });
    });

    this.command('list', async (ctx) => {
      const wallets = await this.userService.getTrackedWallets(BigInt(ctx.chat.id));
      if (wallets.length === 0) return ctx.reply('No wallets tracked. Use /watch to add one.');
      const lines = wallets.map((w, i) =>
        `${i + 1}. \`${w.address}\` — ${w.label}`,
      );
      await ctx.reply(`📋 Tracked Wallets\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
    });

    this.command('threshold', async (ctx) => {
      const text = ctx.message.text;
      const parts = text.split(/\s+/);
      if (parts.length < 2) return ctx.reply('Usage: /threshold <usd_amount>\nExample: /threshold 50000');
      const amount = parseFloat(parts[1]);
      if (isNaN(amount) || amount < 0) return ctx.reply('Please provide a valid USD amount.');
      await this.userService.updateThreshold(BigInt(ctx.chat.id), amount);
      await ctx.reply(`💰 Alert threshold set to $${amount.toLocaleString()}`);
    });

    this.command('alerts', async (ctx) => {
      const text = ctx.message.text;
      const parts = text.split(/\s+/);
      if (parts.length < 2 || !['on', 'off'].includes(parts[1])) return ctx.reply('Usage: /alerts on|off');
      const enabled = parts[1] === 'on';
      await this.userService.toggleAlerts(BigInt(ctx.chat.id), enabled);
      await ctx.reply(`🔔 Alerts turned ${enabled ? 'on' : 'off'}`);
    });

    this.action(/^watch:(.+)/, async (ctx) => {
      const address = ctx.match![1];
      if (!isAddress(address) || !ctx.chat) return ctx.answerCbQuery('Invalid address');
      await this.userService.addWatch(BigInt(ctx.chat.id), address, 'From Alert');
      await ctx.answerCbQuery('✅ Added to watch list');
    });

    this.action(/^unwatch:(.+)/, async (ctx) => {
      const address = ctx.match![1];
      if (!isAddress(address) || !ctx.chat) return ctx.answerCbQuery('Invalid address');
      const removed = await this.userService.removeWatch(BigInt(ctx.chat.id), address);
      await ctx.answerCbQuery(removed ? '⏹ Removed from watch list' : 'Not in your watch list');
    });
  }

  initBot() {
    this.logger.log('Bot starting...');
    this.telegram
      .getMe()
      .then((me) => {
        this.botInfo = me;
        this.logger.log(`@${me.username} authenticated, starting launch`);
        this.launch({ dropPendingUpdates: true });
      })
      .catch((err: any) => this.logger.warn(`Bot unavailable: ${err?.message ?? err}`));
  }

  async onModuleDestroy() {
    this.logger.log('Bot stopping...');
    await this.stop();
  }
}
