import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { Plan } from '../plan/entities/plan.entity';

@Injectable()
export class TelegramService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Plan)
    private planRepository: Repository<Plan>,
  ) {}

  async handleBuyCallback(chatId: number, userId: number, bot: any) {
    // 1. چک عضویت در کانال اسپانسر
    const SPONSOR_CHANNEL_ID = process.env.SPONSOR_CHANNEL_ID; // مثل -1001234567890
    const isMember = await this.checkChannelMembership(userId, SPONSOR_CHANNEL_ID, bot);
    
    if (!isMember) {
      // عضو نیست → لینک کانال رو بفرست
      await bot.sendMessage(chatId, 
        `🔒 برای خرید VPN ابتدا باید در کانال ما عضو شوید.\n\n` +
        `👉 [عضویت در کانال اسپانسر](https://t.me/your_channel_username)\n\n` +
        `پس از عضویت، دوباره روی دکمه خرید کلیک کنید.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    // 2. عضو هست → ثبت یا به‌روزرسانی کاربر در دیتابیس
    await this.userRepository.upsert(
      {
        id: userId,
        username: (await bot.getChat(chatId)).username,
        first_name: (await bot.getChat(chatId)).first_name,
        status: true,
      },
      ['id'] // اگر id وجود داشت آپدیت کن، نه ریپلیس
    );
    
    // 3. دریافت لیست پلن‌های فعال از دیتابیس
    const plans = await this.planRepository.find({
      where: { is_active: true },
      order: { price: 'ASC' },
    });
    
    if (plans.length === 0) {
      await bot.sendMessage(chatId, '⚠️ متأسفانه هیچ پلن فعالی در حال حاضر وجود ندارد.');
      return;
    }
    
    // 4. ساخت دکمه‌های پلن‌ها
    const planButtons = plans.map(plan => [
      { text: `${plan.name} - ${plan.price.toLocaleString()} تومان`, callback_data: `plan_${plan.id}` }
    ]);
    
    await bot.sendMessage(chatId, 
      `🎯 لطفاً یکی از پلن‌های زیر را انتخاب کنید:`,
      {
        reply_markup: {
          inline_keyboard: planButtons,
        },
      }
    );
  }

  private async checkChannelMembership(userId: number, channelId: string, bot: any): Promise<boolean> {
    try {
      const chatMember = await bot.getChatMember(channelId, userId);
      const status = chatMember.status;
      return ['member', 'administrator', 'creator'].includes(status);
    } catch (error) {
      console.error('خطا در بررسی عضویت:', error.message);
      return false;
    }
  }
}