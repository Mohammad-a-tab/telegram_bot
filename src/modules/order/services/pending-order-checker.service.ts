import { Injectable, Logger } from '@nestjs/common';
import { OrderRepository } from '../repositories/order.repository';
import { OrderStatus, StockCheckInterval } from '../../../common/enums';

@Injectable()
export class PendingOrderCheckerService {
  private readonly logger = new Logger(PendingOrderCheckerService.name);
  private readonly reportedIds = new Set<number>();

  constructor(private readonly orderRepository: OrderRepository) {}

  startChecking(bot: any, adminGroupId: string): void {
    this.logger.log('Pending order checker started — interval: 5 minutes');
    this.checkAndNotify(bot, adminGroupId);
    setInterval(() => this.checkAndNotify(bot, adminGroupId), StockCheckInterval.PENDING_ORDERS_MS);
  }

  async checkAndNotify(bot: any, adminGroupId: string): Promise<void> {
    try {
      const pending   = await this.orderRepository.findByStatus(OrderStatus.PENDING);
      const newOrders = pending.filter((o) => !this.reportedIds.has(o.id));

      for (const order of newOrders) {
        this.reportedIds.add(order.id);

        const username = order.user?.username
          ? `@${order.user.username}`
          : order.user?.first_name ?? `کاربر ${order.user_id}`;

        const caption =
          `🆕 <b>سفارش جدید در انتظار تایید!</b>\n\n` +
          `👤 کاربر: ${username}\n` +
          `🆔 آیدی: <code>${order.user_id}</code>\n` +
          `📦 پلن: ${order.plan?.name}\n` +
          `💰 مبلغ: ${order.amount.toLocaleString()} تومان\n` +
          `🆔 شماره سفارش: #${order.id}\n` +
          `📅 تاریخ: ${new Date(order.created_at).toLocaleDateString('fa-IR')}`;

        const buttons = {
          inline_keyboard: [[
            { text: '✅ تایید', callback_data: `approve_order_${order.id}` },
            { text: '❌ رد',   callback_data: `reject_order_${order.id}` },
          ]],
        };

        if (order.payment_receipt_file_id) {
          await bot.sendPhoto(adminGroupId, order.payment_receipt_file_id, {
            caption, parse_mode: 'HTML', reply_markup: buttons,
          });
        } else {
          await bot.sendMessage(adminGroupId, caption, {
            parse_mode: 'HTML', reply_markup: buttons,
          });
        }
      }
    } catch (error) {
      this.logger.error(`Pending order check failed: ${error.message}`);
    }
  }

  removeReportedOrder(orderId: number): void {
    this.reportedIds.delete(orderId);
  }
}
