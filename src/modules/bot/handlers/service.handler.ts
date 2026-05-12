import { BotService } from '../bot.service';
import { Plan } from '../../plan/entities/plan.entity';

export class ServiceHandler {
  constructor(private readonly botService: BotService) {}

  private getBandwidthText(plan: Plan): string {
    if (!plan) return '';
    if (plan.bandwidth_value === 0) return '♾️ نامحدود';
    const unit = plan.bandwidth_unit === 'GB' ? 'گیگابایت' : plan.bandwidth_unit === 'MB' ? 'مگابایت' : 'ترابایت';
    return `${plan.bandwidth_value.toLocaleString()} ${unit}`;
  }

  async showDetail(chatId: number, userId: number, serviceId: number) {
    if (!await this.botService.ensureMembership(userId, chatId)) return;
  
    const order = await this.botService.orderRepo.findOne({ 
      where: { id: serviceId, user_id: userId },
      relations: ['plan', 'config']
    });
    
    if (!order || order.status !== 1) {
      await this.botService.sendMessage(chatId, '❌ سرویس مورد نظر یافت نشد یا فعال نیست.');
      return;
    }
  
    const plan = order.plan;
    const config = order.config;
    const subLink = await this.botService.sub.getSub();
  
    const expiryDate = order.expires_at ? new Date(order.expires_at) : new Date(order.approved_at || order.created_at);
    expiryDate.setDate(expiryDate.getDate() + (plan?.duration_days || 30));
    const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
 
    const volumeText = this.getBandwidthText(plan);
    const configLink = config?.config_link || '';
    const finalLink = `${subLink}${configLink}`;
  
    const message = 
      `🌟 جزئیات سرویس 🌟\n\n` +
      `📛 نام اشتراک: ${plan?.name}\n` +
      `📊 حجم اشتراک: ${volumeText}\n` +
      `👥 محدودیت کاربر: ♾️ بدون محدودیت\n` +
      `⏰ زمان باقی مانده: ${daysLeft > 0 ? daysLeft : 0} روز\n\n` +
      `🔗 <b>لینک اشتراک:</b>\n` +
      `<code>${finalLink}</code>`;
  
    await this.botService.sendMessage(chatId, message, { 
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔧 نحوه اتصال', callback_data: 'how_to_connect' }],
          [{ text: '🏠 بازگشت به صفحه اصلی', callback_data: 'main_menu' }]
        ]
      }
    });
  }

  async copyConfigLink(chatId: number, userId: number, configLink: string) {
    const subLink = await this.botService.sub.getSub();
    const finalLink = `${subLink}${configLink}`;
    
    await this.botService.sendMessage(chatId, 
      `🔗 **لینک اشتراک شما**\n\n` +
      `\`${finalLink}\`\n\n` +
      `📌 برای کپی کردن، روی لینک کلیک کنید.`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔧 نحوه اتصال', callback_data: 'how_to_connect' }],
            [{ text: '🏠 بازگشت به صفحه اصلی', callback_data: 'main_menu' }]
          ]
        }
      }
    );
  }
}