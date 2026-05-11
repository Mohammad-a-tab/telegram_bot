import { Injectable } from '@nestjs/common';

@Injectable()
export class AdminMiddleware {
  private adminIds: number[] = [];

  constructor() {
    const adminIds = process.env.ADMIN_IDS;
    if (adminIds) {
      this.adminIds = adminIds.split(',').map(id => parseInt(id));
    }
  }

  async isAdmin(userId: number): Promise<boolean> {
    return this.adminIds.includes(userId);
  }

  async checkAdmin(bot: any, userId: number, chatId: number): Promise<boolean> {
    const isAdmin = await this.isAdmin(userId);
    
    if (!isAdmin) {
      await bot.sendMessage(chatId, '❌ شما دسترسی به این بخش را ندارید.');
      return false;
    }
    
    return true;
  }
}