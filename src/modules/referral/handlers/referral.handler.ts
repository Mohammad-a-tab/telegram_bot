import { Injectable } from '@nestjs/common';
import { ReferralService } from '../services/referral.service';
import { UserService } from '../../user/services/user.service';
import { TelegramSender } from '../../bot/utils/telegram-sender';

@Injectable()
export class ReferralHandler {
  constructor(
    private readonly referralService: ReferralService,
    private readonly userService: UserService,
    private readonly sender: TelegramSender,
  ) {}

  async showInvitePage(bot: any, chatId: number, userId: number): Promise<void> {
    await this.sender.send(
      bot,
      chatId,
      `⛔️ سرویس دعوت از دوستان در حال حاضر موقتاً غیرفعال است.\n\nلطفاً بعداً دوباره تلاش کنید.`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 بازگشت', callback_data: 'main_menu' }],
          ],
        },
      },
    );
  }

  /** Send the invite link as a separate copyable message */
  async sendInviteLink(bot: any, chatId: number, userId: number): Promise<void> {
    const refCode = await this.userService.ensureRefCode(userId);
    const link = this.referralService.getInviteLink(refCode);
    await this.sender.send(
      bot,
      chatId,
      `🔗 لینک دعوت شما:\n<code>${link}</code>`,
      { parse_mode: 'HTML' },
    );
  }

  /** Notify the inviter they earned a reward */
  async notifyReward(
    bot: any,
    inviterId: number,
    planName: string,
    configLink: string,
  ): Promise<void> {
    await this.sender.send(
      bot,
      inviterId,
      `🎉 تبریک! جایزه دعوت دریافت کردی!\n\n` +
      `✅ با دعوت موفق دوستانت، پلن <b>${planName}</b> به صورت رایگان برات فعال شد!\n\n` +
      `🔗 لینک اشتراک:\n<code>${configLink}</code>\n\n` +
      `📌 برای کپی کردن روی لینک کلیک کن.`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔧 نحوه اتصال', callback_data: 'how_to_connect' }],
            [{ text: '🏠 بازگشت به صفحه اصلی', callback_data: 'main_menu' }],
          ],
        },
      },
    );
  }
}
