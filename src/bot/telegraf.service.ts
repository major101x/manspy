import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { UserService } from './user.service';

@Injectable()
export class TelegrafService extends Telegraf implements OnModuleDestroy {
  private readonly logger = new Logger(TelegrafService.name);

  constructor(
    config: ConfigService,
    private userService: UserService,
  ) {
    super(config.get<string>('TELEGRAM_BOT_TOKEN')!);

    this.start(async (ctx) => {
      await this.userService.findOrCreate(BigInt(ctx.chat.id));
      await ctx.reply(
        '👋 Welcome to Mantle Watchdog!\n\n'
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
      await ctx.reply(
        `📊 Your Settings\n\n`
        + `Alerts: ${user.alertsEnabled ? '✅ On' : '❌ Off'}\n`
        + `Threshold: $${user.thresholdUsd.toLocaleString()}\n`
        + `Tracked wallets: ${wallets.length}`,
      );
    });
  }

  initBotPolling() {
    this.logger.log('Bot launching (polling)...');
    this.telegram
      .getMe()
      .then((me) => {
        this.botInfo = me;
        this.logger.log(`@${me.username} authenticated`);
        return this.launch({ dropPendingUpdates: true });
      })
      .then(() => this.logger.log('Bot polling for updates'))
      .catch((err: any) => this.logger.warn(`Bot polling unavailable: ${err?.message ?? err}`));
  }

  async initBotWebhook(domain: string): Promise<any> {
    this.logger.log(`Bot launching (webhook) @ ${domain}...`);
    const me = await this.telegram.getMe();
    this.botInfo = me;
    this.logger.log(`@${me.username} authenticated`);

    const path = `/telegraf`;
    await this.telegram.setWebhook(`${domain}${path}`);
    this.logger.log(`Webhook set to ${domain}${path}`);

    return this.webhookCallback(path);
  }

  async onModuleDestroy() {
    this.logger.log('Bot stopping...');
    await this.stop();
  }
}
