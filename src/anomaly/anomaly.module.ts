import { Module } from '@nestjs/common';
import { AnomalyService } from './anomaly.service';
import { ChainIntelModule } from '../common/chain-intel/chain-intel.module';
import { Web3Module } from '../web3/web3.module';

@Module({
  imports: [ChainIntelModule, Web3Module],
  providers: [AnomalyService],
  exports: [AnomalyService],
})
export class AnomalyModule {}
