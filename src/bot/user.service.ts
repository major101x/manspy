import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findOrCreate(telegramChatId: bigint) {
    let user = await this.prisma.user.findUnique({ where: { telegramChatId } });
    if (!user) {
      user = await this.prisma.user.create({ data: { telegramChatId } });
    }
    return user;
  }

  async updateThreshold(telegramChatId: bigint, thresholdUsd: number) {
    return this.prisma.user.update({
      where: { telegramChatId },
      data: { thresholdUsd },
    });
  }

  async getTrackedWallets(telegramChatId: bigint) {
    return this.prisma.trackedWallet.findMany({
      where: { user: { telegramChatId } },
    });
  }
}
