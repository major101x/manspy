import { Module } from '@nestjs/common';
import { DetectionModule } from '../detection/detection.module';
import { TelegrafService } from './telegraf.service';
import { UserService } from './user.service';

@Module({
  imports: [DetectionModule],
  providers: [TelegrafService, UserService],
  exports: [TelegrafService, UserService],
})
export class BotModule {}
