import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TelegrafService } from './bot/telegraf.service';
import express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const bot = app.get(TelegrafService);
  bot.initBot();

  const expressApp = app.getHttpAdapter().getInstance() as express.Application;
  expressApp.get('/health', (_req: express.Request, res: express.Response) => res.json({ ok: true }));

  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
