import { Module } from '@nestjs/common';
import { AddressLabelService } from './address-label.service';
import { RecentTxBufferService } from './recent-tx-buffer.service';

@Module({
  providers: [AddressLabelService, RecentTxBufferService],
  exports: [AddressLabelService, RecentTxBufferService],
})
export class ChainIntelModule {}
