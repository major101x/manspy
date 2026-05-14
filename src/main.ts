import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TelegrafService } from './bot/telegraf.service';
import { EnvConfig } from './config/env.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const bot = app.get(TelegrafService);
  const env = app.get(EnvConfig);
  const domain = env.botDomain;

  if (domain) {
    const middleware = await bot.initBotWebhook(domain);
    app.use('/telegraf', middleware);
  } else {
    bot.initBotPolling();
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
