import { Module } from '@nestjs/common';
import { AddressLabelService } from './address-label.service';
import { RecentTxBufferService } from './recent-tx-buffer.service';
import { NansenModule } from '../../nansen/nansen.module';

@Module({
  imports: [NansenModule],
  providers: [AddressLabelService, RecentTxBufferService],
  exports: [AddressLabelService, RecentTxBufferService],
})
export class ChainIntelModule {}
