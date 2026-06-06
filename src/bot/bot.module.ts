import { Module } from '@nestjs/common';
import { DetectionModule } from '../detection/detection.module';
import { ChainIntelModule } from '../common/chain-intel/chain-intel.module';
import { Web3Module } from '../web3/web3.module';
import { TelegrafService } from './telegraf.service';
import { UserService } from './user.service';

@Module({
  imports: [DetectionModule, ChainIntelModule, Web3Module],
  providers: [TelegrafService, UserService],
  exports: [TelegrafService, UserService],
})
export class BotModule {}
