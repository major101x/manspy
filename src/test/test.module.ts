import { Module } from '@nestjs/common';
import { DetectionModule } from '../detection/detection.module';
import { AnomalyModule } from '../anomaly/anomaly.module';
import { BotModule } from '../bot/bot.module';
import { ChainIntelModule } from '../common/chain-intel/chain-intel.module';
import { TestController } from './test.controller';

@Module({
  imports: [DetectionModule, AnomalyModule, BotModule, ChainIntelModule],
  controllers: [TestController],
})
export class TestModule {}
