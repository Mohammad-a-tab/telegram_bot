import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Injectable()
export class ChannelMiddleware {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async checkMembership(bot: any, userId: number, chatId: number): Promise<boolean> {
    const SPONSOR_CHANNEL_ID = process.env.SPONSOR_CHANNEL_ID;
    const SPONSOR_GROUP_ID = process.env.SPONSOR_GROUP_ID;

    if (!SPONSOR_CHANNEL_ID && !SPONSOR_GROUP_ID) {
      console.error('❌ No channel or group configured');
      return false;
    }

    let isChannelMember = true;
    let isGroupMember = true;
    let errorMessage = '';

    if (SPONSOR_CHANNEL_ID) {
      try {
        const channelMember = await bot.getChatMember(SPONSOR_CHANNEL_ID, userId);
        const channelStatus = channelMember.status;
        isChannelMember = ['member', 'administrator', 'creator'].includes(channelStatus);
        
        if (!isChannelMember) {
          errorMessage += `📢 کانال: ${process.env.SPONSOR_CHANNEL_USERNAME || 'کانال اسپانسر'}\n`;
        }
      } catch (error) {
        console.error('Channel check error:', error.message);
        isChannelMember = false;
        errorMessage += `📢 کانال (خطا در بررسی)\n`;
      }
    }

    if (SPONSOR_GROUP_ID) {
      try {
        const groupMember = await bot.getChatMember(SPONSOR_GROUP_ID, userId);
        const groupStatus = groupMember.status;
        isGroupMember = ['member', 'administrator', 'creator'].includes(groupStatus);
        
        if (!isGroupMember) {
          errorMessage += `👥 گروه: ${process.env.SPONSOR_GROUP_USERNAME || 'گروه پشتیبانی'}\n`;
        }
      } catch (error) {
        console.error('Group check error:', error.message);
        isGroupMember = false;
        errorMessage += `👥 گروه (خطا در بررسی)\n`;
      }
    }

    const isMember = isChannelMember && isGroupMember;

    // به‌روزرسانی در دیتابیس با مقدار واقعی
    await this.userRepository.update(
      { id: userId },
      { is_member_of_channel: isMember }
    );

    if (!isMember) {
      // ساخت inline_keyboard به صورت داینامیک و معتبر
      const inlineKeyboard = [];
      
      // دکمه بررسی مجدد
      inlineKeyboard.push([{ text: '🔄 بررسی مجدد عضویت', callback_data: 'check_membership' }]);
      
      // دکمه عضویت در کانال (اگر کانال تنظیم شده باشد)
      if (SPONSOR_CHANNEL_ID && process.env.SPONSOR_CHANNEL_USERNAME) {
        inlineKeyboard.push([{ text: '📢 عضویت در کانال', url: `https://t.me/${process.env.SPONSOR_CHANNEL_USERNAME}` }]);
      }
      
      // دکمه عضویت در گروه (اگر گروه تنظیم شده باشد)
      if (SPONSOR_GROUP_ID && process.env.SPONSOR_GROUP_USERNAME) {
        inlineKeyboard.push([{ text: '👥 عضویت در گروه', url: `https://t.me/${process.env.SPONSOR_GROUP_USERNAME}` }]);
      }

      const message = `🔒 **دسترسی محدود شده است!**\n\n` +
        `برای استفاده از ربات باید در مکان‌های زیر عضو باشید:\n\n` +
        `${errorMessage}\n` +
        `✅ پس از عضویت، دکمه "بررسی مجدد" را بزنید.`;

      await bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      });
      
      return false;
    }

    return true;
  }

  async ensureMembership(bot: any, userId: number, chatId: number): Promise<boolean> {
    const isMember = await this.checkMembership(bot, userId, chatId);
    
    await this.userRepository.update(
      { id: userId },
      { is_member_of_channel: isMember }
    );

    return isMember;
  }
}