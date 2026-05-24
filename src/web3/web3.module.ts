import { Module } from '@nestjs/common';
import { AlertLogService } from './alert-log.service';

@Module({
  providers: [AlertLogService],
  exports: [AlertLogService],
})
export class Web3Module {}
