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

  async addWatch(telegramChatId: bigint, address: string, label: string) {
    const user = await this.findOrCreate(telegramChatId);
    return this.prisma.trackedWallet.create({
      data: { userId: user.id, address: address.toLowerCase(), label },
    });
  }

  async removeWatch(telegramChatId: bigint, address: string) {
    const user = await this.findOrCreate(telegramChatId);
    const wallet = await this.prisma.trackedWallet.findFirst({
      where: { userId: user.id, address: address.toLowerCase() },
    });
    if (!wallet) return false;
    await this.prisma.trackedWallet.delete({ where: { id: wallet.id } });
    return true;
  }

  async toggleAlerts(telegramChatId: bigint, enabled: boolean) {
    return this.prisma.user.update({
      where: { telegramChatId },
      data: { alertsEnabled: enabled },
    });
  }
}
