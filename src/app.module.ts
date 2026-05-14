import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EnvConfigModule } from './config/env-config.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { BotModule } from './bot/bot.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { PriceModule } from './price/price.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EnvConfigModule,
    PrismaModule,
    BotModule,
    IngestionModule,
    PriceModule,
  ],
})
export class AppModule {}
