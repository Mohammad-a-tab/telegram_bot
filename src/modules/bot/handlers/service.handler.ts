import { BotService } from '../bot.service';

export class ServiceHandler {
  constructor(private readonly botService: BotService) {}

  async showDetail(chatId: number, userId: number, serviceId: number) {
    if (!await this.botService.ensureMembership(userId, chatId)) return;
  
    const order = await this.botService.orderRepo.findOne({ where: { id: serviceId, user_id: userId } });
    if (!order || order.status !== 1) {
      await this.botService.sendMessage(chatId, '❌ سرویس مورد نظر یافت نشد یا فعال نیست.');
      return;
    }
  
    const plan = await this.botService.planRepo.findOne({ where: { id: order.plan_id } });
    const config = await this.botService.configRepo.findOne({ where: { id: order.config_id } });
    const subLink = await this.botService.sub.getSub();
  
    const expiryDate = order.expires_at ? new Date(order.expires_at) : new Date(order.approved_at || order.created_at);
    expiryDate.setDate(expiryDate.getDate() + (plan?.duration_days || 30));
    const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
 
    const volumeText = `${plan?.bandwidth_gb} GB`;
    const configLink = config?.config_link || '';
  
    const message = 
      `🌟 جزئیات سرویس 🌟\n\n` +
      `📛 نام اشتراک: ${plan?.name}\n` +
      `📊 حجم اشتراک: ${volumeText}\n` +
      `👥 محدودیت کاربر: ♾️\n` +
      `⏰ زمان باقی مانده: ${daysLeft > 0 ? daysLeft : 0} روز\n\n` +
      `🔗 لینک اشتراک: \`${subLink}${configLink}\``;
  
    await this.botService.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }

  async copyConfigLink(chatId: number, userId: number, configLink: string) {
    const subLink = await this.botService.sub.getSub();
    await this.botService.sendMessage(chatId, 
      `🔗 لینک اشتراک شما\n\n\`${subLink}${configLink}\`\n\n📌 برای کپی کردن، روی لینک بالا کلیک کنید.`,
      { parse_mode: 'Markdown' }
    );
  }
}