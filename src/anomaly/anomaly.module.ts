import { Module } from '@nestjs/common';
import { AnomalyService } from './anomaly.service';
import { ChainIntelModule } from '../common/chain-intel/chain-intel.module';

@Module({
  imports: [ChainIntelModule],
  providers: [AnomalyService],
  exports: [AnomalyService],
})
export class AnomalyModule {}
