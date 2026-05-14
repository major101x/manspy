import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TelegrafService } from './bot/telegraf.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const bot = app.get(TelegrafService);
  await bot.launch();

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
