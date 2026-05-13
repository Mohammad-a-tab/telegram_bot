import { Injectable, Logger } from '@nestjs/common';
import { UserService } from '../../user/services';

@Injectable()
export class ChannelMiddleware {
  private readonly logger = new Logger(ChannelMiddleware.name);
  private readonly channelId = process.env.SPONSOR_CHANNEL_ID;
  private readonly groupId = process.env.SPONSOR_GROUP_ID;
  private readonly channelUsername = process.env.SPONSOR_CHANNEL_USERNAME;
  private readonly groupUsername = process.env.SPONSOR_GROUP_USERNAME;

  constructor(private readonly userService: UserService) {}

  async ensureMembership(bot: any, userId: number, chatId: number): Promise<boolean> {
    const isMember = await this.checkMembership(bot, userId);
    await this.userService.updateMembership(userId, isMember);

    if (!isMember) {
      await this.sendJoinMessage(bot, chatId);
    }

    return isMember;
  }

  private async checkMembership(bot: any, userId: number): Promise<boolean> {
    const checks = await Promise.all([
      this.checkChat(bot, userId, this.channelId),
      this.checkChat(bot, userId, this.groupId),
    ]);
    return checks.every(Boolean);
  }

  private async checkChat(bot: any, userId: number, chatId?: string): Promise<boolean> {
    if (!chatId) return true;
    try {
      const member = await bot.getChatMember(chatId, userId);
      return ['member', 'administrator', 'creator'].includes(member.status);
    } catch (error) {
      this.logger.error(`Membership check failed for chat ${chatId}: ${error.message}`);
      return false;
    }
  }

  private async sendJoinMessage(bot: any, chatId: number): Promise<void> {
    const buttons: any[] = [
      [{ text: '🔄 بررسی مجدد عضویت', callback_data: 'check_membership' }],
    ];

    if (this.channelId && this.channelUsername) {
      buttons.push([{ text: '📢 عضویت در کانال', url: `https://t.me/${this.channelUsername}` }]);
    }
    if (this.groupId && this.groupUsername) {
      buttons.push([{ text: '👥 عضویت در گروه', url: `https://t.me/${this.groupUsername}` }]);
    }

    await bot.sendMessage(
      chatId,
      `🔒 برای استفاده از ربات باید در کانال/گروه ما عضو باشید.\n\nپس از عضویت دکمه بررسی مجدد را بزنید.`,
      { reply_markup: { inline_keyboard: buttons } },
    );
  }
}
