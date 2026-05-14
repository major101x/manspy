import { Module } from '@nestjs/common';
import { TelegrafService } from './telegraf.service';
import { UserService } from './user.service';

@Module({
  providers: [TelegrafService, UserService],
  exports: [TelegrafService, UserService],
})
export class BotModule {}
