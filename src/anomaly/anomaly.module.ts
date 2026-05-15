import { Module } from '@nestjs/common';
import { AnomalyService } from './anomaly.service';

@Module({
  providers: [AnomalyService],
  exports: [AnomalyService],
})
export class AnomalyModule {}
