import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { isAddress } from 'viem';
import { UserService } from './user.service';
import { RateLimitService } from '../detection/rate-limit.service';
import { FlowAggregatorService } from '../common/chain-intel/flow-aggregator.service';
import { AlertLogService } from '../web3/alert-log.service';

@Injectable()
export class TelegrafService extends Telegraf implements OnModuleDestroy {
  private readonly logger = new Logger(TelegrafService.name);

  constructor(
    config: ConfigService,
    private userService: UserService,
    private rateLimit: RateLimitService,
    private flow: FlowAggregatorService,
    private alertLog: AlertLogService,
  ) {
    super(config.get<string>('TELEGRAM_BOT_TOKEN')!);

    this.start(async (ctx) => {
      await this.userService.findOrCreate(BigInt(ctx.chat.id));
      await ctx.reply(
        '👋 Welcome to ManSpy!\n\n' +
          'I monitor Mantle Network for whale movements and on-chain anomalies.\n\n' +
          'Commands:\n' +
          '/watch <address> <label> — track a wallet\n' +
          '/unwatch <address> — stop tracking\n' +
          '/list — show tracked wallets\n' +
          '/threshold <usd> — set minimum alert value\n' +
          '/alerts on|off — toggle alerts\n' +
          '/flows — live Mantle flow digest (CEX flow, accumulators)\n' +
          '/contract — on-chain audit trail\n' +
          '/status — your settings\n' +
          '/help — this message',
      );
    });

    this.help(async (ctx) => {
      await ctx.reply(
        'Commands:\n' +
          '/start — welcome & onboarding\n' +
          '/watch <address> <label> — register a wallet to track\n' +
          '/unwatch <address> — stop tracking a wallet\n' +
          '/list — show all tracked wallets\n' +
          '/alerts on|off — toggle all alerts\n' +
          '/threshold <usd_amount> — set minimum USD value to alert on (default $50,000)\n' +
          '/flows — aggregated market flow digest (net CEX flow, top accumulators, distribution waves)\n' +
          '/contract — view the on-chain audit trail (every AI verdict logged on Mantle)\n' +
          '/status — show bot status and your current settings\n' +
          '/help — command reference',
      );
    });

    this.command('status', async (ctx) => {
      const user = await this.userService.findOrCreate(BigInt(ctx.chat.id));
      const wallets = await this.userService.getTrackedWallets(
        BigInt(ctx.chat.id),
      );
      const rate = this.rateLimit.getStatus(user.id);
      await ctx.reply(
        `📊 Your Settings\n\n` +
          `Alerts: ${user.alertsEnabled ? '✅ On' : '❌ Off'}\n` +
          `Threshold: $${user.thresholdUsd.toLocaleString()}\n` +
          `Tracked wallets: ${wallets.length}\n` +
          `Rate limit: ${rate.count}/${rate.limit} this hour` +
          (rate.resetInMinutes > 0
            ? ` (resets in ${rate.resetInMinutes}min)`
            : ''),
      );
    });

    this.command('flows', async (ctx) => {
      await ctx.reply(this.formatFlowDigest(), { parse_mode: 'Markdown' });
    });

    this.command('contract', async (ctx) => {
      const stats = await this.alertLog.getStats();
      if (!stats) {
        return ctx.reply(
          '🔐 On-chain audit logging is not configured for this deployment.',
        );
      }
      const count =
        stats.recordCount === null
          ? '(temporarily unavailable)'
          : `${stats.recordCount.toLocaleString()}`;
      await ctx.reply(
        `🔐 *On-Chain Audit Trail*\n\n` +
          `Every AI verdict is logged on Mantle Sepolia for verifiable, tamper-proof auditability.\n\n` +
          `Contract: \`${stats.address}\`\n` +
          `Verdicts logged on-chain: *${count}*\n` +
          `Verify: ${stats.explorerUrl}`,
        { parse_mode: 'Markdown' },
      );
    });

    this.command('watch', async (ctx) => {
      const text = ctx.message.text;
      const parts = text.split(/\s+/);
      if (parts.length < 2 || !isAddress(parts[1])) {
        return ctx.reply(
          'Usage: /watch <address> <label>\nExample: /watch 0x1234...5678 Binance Hot Wallet',
        );
      }
      const address = parts[1];
      const label = parts.slice(2).join(' ') || 'Untitled';
      await this.userService.addWatch(BigInt(ctx.chat.id), address, label);
      await ctx.reply(`✅ Now tracking \`${address}\` — ${label}`, {
        parse_mode: 'Markdown',
      });
    });

    this.command('unwatch', async (ctx) => {
      const text = ctx.message.text;
      const parts = text.split(/\s+/);
      if (parts.length < 2 || !isAddress(parts[1])) {
        return ctx.reply(
          'Usage: /unwatch <address>\nExample: /unwatch 0x1234...5678',
        );
      }
      const removed = await this.userService.removeWatch(
        BigInt(ctx.chat.id),
        parts[1],
      );
      if (!removed) return ctx.reply('That address is not in your watch list.');
      await ctx.reply(`⏹ Stopped tracking \`${parts[1]}\``, {
        parse_mode: 'Markdown',
      });
    });

    this.command('list', async (ctx) => {
      const wallets = await this.userService.getTrackedWallets(
        BigInt(ctx.chat.id),
      );
      if (wallets.length === 0)
        return ctx.reply('No wallets tracked. Use /watch to add one.');
      const lines = wallets.map(
        (w, i) => `${i + 1}. \`${w.address}\` — ${w.label}`,
      );
      await ctx.reply(`📋 Tracked Wallets\n\n${lines.join('\n')}`, {
        parse_mode: 'Markdown',
      });
    });

    this.command('threshold', async (ctx) => {
      const text = ctx.message.text;
      const parts = text.split(/\s+/);
      if (parts.length < 2)
        return ctx.reply(
          'Usage: /threshold <usd_amount>\nExample: /threshold 50000',
        );
      const amount = parseFloat(parts[1]);
      if (isNaN(amount) || amount < 0)
        return ctx.reply('Please provide a valid USD amount.');
      await this.userService.updateThreshold(BigInt(ctx.chat.id), amount);
      await ctx.reply(`💰 Alert threshold set to $${amount.toLocaleString()}`);
    });

    this.command('alerts', async (ctx) => {
      const text = ctx.message.text;
      const parts = text.split(/\s+/);
      if (parts.length < 2 || !['on', 'off'].includes(parts[1]))
        return ctx.reply('Usage: /alerts on|off');
      const enabled = parts[1] === 'on';
      await this.userService.toggleAlerts(BigInt(ctx.chat.id), enabled);
      await ctx.reply(`🔔 Alerts turned ${enabled ? 'on' : 'off'}`);
    });

    this.action(/^watch:(.+)/, async (ctx) => {
      const address = ctx.match[1];
      if (!isAddress(address) || !ctx.chat)
        return ctx.answerCbQuery('Invalid address');
      await this.userService.addWatch(
        BigInt(ctx.chat.id),
        address,
        'From Alert',
      );
      await ctx.answerCbQuery('✅ Added to watch list');
    });

    this.action(/^unwatch:(.+)/, async (ctx) => {
      const address = ctx.match[1];
      if (!isAddress(address) || !ctx.chat)
        return ctx.answerCbQuery('Invalid address');
      const removed = await this.userService.removeWatch(
        BigInt(ctx.chat.id),
        address,
      );
      await ctx.answerCbQuery(
        removed ? '⏹ Removed from watch list' : 'Not in your watch list',
      );
    });
  }

  private formatFlowDigest(): string {
    const f = this.flow.computeMarketFlows();
    if (f.txCount === 0) {
      return '📊 No transactions buffered yet. Flow signals appear as Mantle activity streams in.';
    }

    const coveredMin = Math.max(1, Math.round(f.windowCoveredMs / 60000));
    const lines: string[] = [];
    lines.push(
      `📊 *Mantle Flow Digest* (last ~${coveredMin}m, ${f.txCount.toLocaleString()} txs)`,
    );
    lines.push('');

    const net = f.cexNetUsd;
    const dir = net > 0 ? 'outflow' : net < 0 ? 'inflow' : 'flat';
    const hint =
      net > 0
        ? '  ⬅ accumulation signal'
        : net < 0
          ? '  ⬅ sell-side pressure'
          : '';
    lines.push(`CEX net flow: ${this.fmtSigned(net)} (${dir})${hint}`);
    lines.push(
      `  Withdrawals: ${this.fmtUsd(f.cexOutflowUsd)} (${f.cexOutCount}) · ` +
        `Deposits: ${this.fmtUsd(f.cexInflowUsd)} (${f.cexInCount})`,
    );

    if (f.topAccumulators.length) {
      lines.push('');
      lines.push('Top accumulators:');
      f.topAccumulators.forEach((a, i) => {
        lines.push(
          `  ${i + 1}. \`${this.shortAddr(a.address)}\` +${this.fmtUsd(a.netUsd)}`,
        );
      });
    }

    if (f.distributionWaves.length) {
      lines.push('');
      lines.push('Distribution waves:');
      f.distributionWaves.forEach((w) => {
        const who = w.fromLabel ?? this.shortAddr(w.from);
        lines.push(
          `  • ${who} → ${w.recipientCount} wallets, ${this.fmtUsd(w.totalUsd)} total`,
        );
      });
    }

    return lines.join('\n');
  }

  private fmtUsd(usd: number): string {
    const abs = Math.abs(usd);
    if (abs >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `$${(usd / 1e3).toFixed(1)}K`;
    return `$${Math.round(usd).toLocaleString()}`;
  }

  private fmtSigned(usd: number): string {
    const sign = usd < 0 ? '−' : '+';
    return `${sign}${this.fmtUsd(Math.abs(usd))}`;
  }

  private shortAddr(addr: string): string {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  }

  private appRef: any;

  setAppRef(app: any) {
    this.appRef = app;
  }

  async initBotWithRetry(retries = 0) {
    this.logger.log('Bot starting...');
    try {
      const me = await this.telegram.getMe();
      this.botInfo = me;
      this.logger.log(`@${me.username} authenticated, starting launch`);
      this.launch({ dropPendingUpdates: true });
      this.setupRuntimeErrorHandling();
      void this.registerCommandMenu();
    } catch (err: any) {
      if (retries >= 5) {
        this.logger.error(
          `Bot failed to start after 5 retries: ${err?.message ?? err}`,
        );
        await this.gracefulCrash();
        return;
      }
      const delay = Math.min(1000 * 2 ** retries, 30000);
      this.logger.warn(
        `Bot unavailable (${err?.message}), retrying in ${delay}ms...`,
      );
      setTimeout(() => this.initBotWithRetry(retries + 1), delay);
    }
  }

  /** Registers the command list with Telegram so the menu button + autocomplete appear. */
  private async registerCommandMenu() {
    try {
      await this.telegram.setMyCommands([
        { command: 'watch', description: 'Track a wallet: /watch <address> <label>' },
        { command: 'unwatch', description: 'Stop tracking a wallet: /unwatch <address>' },
        { command: 'list', description: 'Show your tracked wallets' },
        { command: 'threshold', description: 'Set minimum alert value: /threshold <usd>' },
        { command: 'alerts', description: 'Toggle alerts: /alerts on|off' },
        { command: 'flows', description: 'Live Mantle flow digest (CEX flow, accumulators)' },
        { command: 'contract', description: 'On-chain audit trail' },
        { command: 'status', description: 'Your current settings' },
        { command: 'help', description: 'Command reference' },
      ]);
      this.logger.log('Command menu registered with Telegram');
    } catch (e: any) {
      this.logger.warn(`Failed to register command menu: ${e?.message}`);
    }
  }

  private setupRuntimeErrorHandling() {
    this.catch((err: any) => {
      const message = err?.message ?? String(err);
      this.logger.error(`Telegraf error: ${message}`);
      const msg = message.toLowerCase();
      const isFatal =
        msg.includes('econnreset') ||
        msg.includes('socket hang up') ||
        msg.includes('401') ||
        msg.includes('unauthorized') ||
        msg.includes('not found');

      if (isFatal) {
        this.logger.error('Fatal bot error detected, shutting down...');
        this.gracefulCrash();
      }
    });
  }

  private async gracefulCrash() {
    try {
      if (this.appRef) {
        this.logger.log('Attempting graceful shutdown...');
        await this.appRef.close();
      }
    } catch (e) {
      this.logger.warn(`Graceful shutdown failed: ${e?.message}`);
    } finally {
      process.exit(1);
    }
  }

  isHealthy(): boolean {
    return this.botInfo !== undefined;
  }

  async onModuleDestroy() {
    this.logger.log('Bot stopping...');
    await this.stop();
  }
}
