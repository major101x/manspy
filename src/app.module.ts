import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EnvConfigModule } from './config/env-config.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { BotModule } from './bot/bot.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { DetectionModule } from './detection/detection.module';
import { AnomalyModule } from './anomaly/anomaly.module';
import { PriceModule } from './price/price.module';
import { TestModule } from './test/test.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EnvConfigModule,
    PrismaModule,
    BotModule,
    IngestionModule,
    DetectionModule,
    AnomalyModule,
    PriceModule,
    TestModule,
  ],
})
export class AppModule {}
