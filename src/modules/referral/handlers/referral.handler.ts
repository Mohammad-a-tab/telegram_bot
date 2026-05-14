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
    const refCode = await this.userService.ensureRefCode(userId);
    const link = this.referralService.getInviteLink(refCode);
    const count = await this.referralService.getInviteCount(userId);

    const nextMilestone = count < 3 ? 3 : count < 12 ? 12 : null;
    const nextPlan = count < 3 ? '100 مگ' : count < 12 ? '500 مگ' : null;
    const remaining = nextMilestone ? nextMilestone - count : 0;

    let progressText = '';
    if (nextMilestone) {
      const prevMilestone = nextMilestone === 3 ? 0 : 3;
      const progressInStage = count - prevMilestone;
      const stageSize = nextMilestone - prevMilestone;
      const filled = '🟢'.repeat(progressInStage);
      const empty  = '⚪'.repeat(stageSize - progressInStage);
      progressText =
        `\n\n📊 پیشرفت شما:\n${filled}${empty} (${count}/${nextMilestone})\n` +
        `⏳ ${remaining} دعوت دیگر تا دریافت پلن ${nextPlan} رایگان`;
    } else {
      progressText = '\n\n🏆 شما تمام جوایز را دریافت کرده‌اید!';
    }

    const message =
      `🎁 دعوت از دوستان\n\n` +
      `با دعوت دوستانت به ربات، پلن رایگان دریافت کن!\n\n` +
      `🎯 جوایز:\n` +
      `• دعوت ۳ نفر → پلن 100 مگ رایگان 🎉\n` +
      `• دعوت ۱۲ نفر → پلن 500 مگ رایگان 🏆\n\n` +
      `👥 تعداد دعوت‌های موفق شما: ${count} نفر` +
      progressText +
      `\n\n🔗 لینک اختصاصی شما:\n<code>${link}</code>\n\n` +
      `📌 لینک را کپی کن و برای دوستانت بفرست.\n` +
      `✅ دوستت باید عضو کانال و گروه بشه تا دعوت تأیید بشه.`;

    await this.sender.send(bot, chatId, message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 کپی لینک دعوت', callback_data: 'copy_invite_link' }],
          [{ text: '🔙 بازگشت', callback_data: 'main_menu' }],
        ],
      },
    });
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
