import { Injectable } from '@nestjs/common';
import { OrderService } from '../../order/services';
import { PlanService } from '../../plan/services';
import { SubService } from '../../sub/services';
import { ChannelMiddleware } from '../../telegram/middlewares/channel.middleware';
import { TelegramSender } from '../utils/telegram-sender';
import { OrderStatus } from '../../order/entities/order.entity';

@Injectable()
export class ServiceHandler {
  constructor(
    private readonly orderService: OrderService,
    private readonly planService: PlanService,
    private readonly subService: SubService,
    private readonly channelMiddleware: ChannelMiddleware,
    private readonly sender: TelegramSender,
  ) {}

  async showDetail(bot: any, chatId: number, userId: number, orderId: number): Promise<void> {
    const isMember = await this.channelMiddleware.ensureMembership(bot, userId, chatId);
    if (!isMember) return;

    const order = await this.orderService.findByIdWithRelations(orderId);
    // user_id is stored as bigint and TypeORM returns it as a string — coerce before comparing
    if (!order || Number(order.user_id) !== userId || order.status !== OrderStatus.APPROVED) {
      await this.sender.send(bot, chatId, '❌ سرویس مورد نظر یافت نشد یا فعال نیست.');
      return;
    }

    const plan = order.plan;
    const subLink = await this.subService.getSub();
    const finalLink = `${subLink ?? ''}${order.config?.config_link ?? ''}`;

    const expiryDate = new Date(order.approved_at ?? order.created_at);
    expiryDate.setDate(expiryDate.getDate() + (plan?.duration_days ?? 30));
    const daysLeft = Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / 86400000));

    const volumeText = plan ? this.planService.getBandwidthText(plan) : '';

    const message =
      `🌟 جزئیات سرویس 🌟\n\n` +
      `📛 نام اشتراک: ${plan?.name}\n` +
      `📊 حجم اشتراک: ${volumeText}\n` +
      `👥 محدودیت کاربر: ♾️ بدون محدودیت\n` +
      `⏰ زمان باقی مانده: ${daysLeft} روز\n\n` +
      `🔗 <b>لینک اشتراک:</b>\n` +
      `<code>${finalLink}</code>`;

    await this.sender.send(bot, chatId, message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔧 نحوه اتصال', callback_data: 'how_to_connect' }],
          [{ text: '🏠 بازگشت به صفحه اصلی', callback_data: 'main_menu' }],
        ],
      },
    });
  }
}
