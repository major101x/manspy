import { Module } from '@nestjs/common';
import { BotModule } from '../bot/bot.module';
import { PriceModule } from '../price/price.module';
import { DetectionModule } from '../detection/detection.module';
import { AnomalyModule } from '../anomaly/anomaly.module';
import { ChainIntelModule } from '../common/chain-intel/chain-intel.module';
import { MantleListenerService } from './mantle-listener.service';
import { TransactionNormalizerService } from './transaction-normalizer.service';
import { TokenParserService } from './token-parser.service';
import { TokenListService } from './token-list.service';

@Module({
  imports: [BotModule, PriceModule, DetectionModule, AnomalyModule, ChainIntelModule],
  providers: [
    MantleListenerService,
    TransactionNormalizerService,
    TokenParserService,
    TokenListService,
  ],
  exports: [
    MantleListenerService,
    TransactionNormalizerService,
  ],
})
export class IngestionModule {}
