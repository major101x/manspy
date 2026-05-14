import { Module } from '@nestjs/common';
import { MantleListenerService } from './mantle-listener.service';
import { TransactionNormalizerService } from './transaction-normalizer.service';

@Module({
  providers: [MantleListenerService, TransactionNormalizerService],
  exports: [MantleListenerService, TransactionNormalizerService],
})
export class IngestionModule {}
