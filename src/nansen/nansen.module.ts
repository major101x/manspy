import { Module } from '@nestjs/common';
import { NansenService } from './nansen.service';

@Module({
  providers: [NansenService],
  exports: [NansenService],
})
export class NansenModule {}
