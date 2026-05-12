import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class PendingOrderCheckerService {
  private readonly CHECK_INTERVAL = 5 * 60 * 1000; // 5 دقیقه
  private reportedOrderIds: Set<number> = new Set();

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private cacheService: CacheService,
  ) {}

  async startChecking(bot: any, adminGroupId: string) {
    console.log('📋 Pending order checker started - checking every 1 minute');
    
    // اجرای اولیه
    await this.checkAndNotify(bot, adminGroupId);
    
    // اجرای دوره‌ای
    setInterval(async () => {
      await this.checkAndNotify(bot, adminGroupId);
    }, this.CHECK_INTERVAL);
  }

  async checkAndNotify(bot: any, adminGroupId: string) {
    try {
      // گرفتن سفارشات در انتظار
      const pendingOrders = await this.orderRepository.find({
        where: { status: 0 },
        relations: ['plan', 'user'],
        order: { id: 'ASC' },
      });

      // فیلتر سفارشاتی که قبلاً گزارش نشده‌اند
      const newOrders = pendingOrders.filter(order => !this.reportedOrderIds.has(order.id));
      
      if (newOrders.length === 0) {
        return;
      }

      for (const order of newOrders) {
        // علامت‌گذاری به عنوان گزارش شده
        this.reportedOrderIds.add(order.id);
        
        // اطلاعات کاربر
        const username = order.user?.username 
          ? `@${order.user.username}` 
          : (order.user?.first_name || `کاربر ${order.user_id}`);
        
        const adminMessage = 
          `🆕 **سفارش جدید در انتظار تایید!**\n\n` +
          `👤 کاربر: ${username}\n` +
          `🆔 آیدی: <code>${order.user_id}</code>\n` +
          `📦 پلن: ${order.plan?.name}\n` +
          `💰 مبلغ: ${order.amount.toLocaleString()} تومان\n` +
          `🆔 شماره سفارش: #${order.id}\n` +
          `📅 تاریخ: ${new Date(order.created_at).toLocaleDateString('fa-IR')}\n` +
          `⏰ ساعت: ${new Date(order.created_at).toLocaleTimeString('fa-IR')}`;
        
        // ارسال عکس رسید + دکمه‌ها
        if (order.payment_receipt_file_id) {
          await bot.sendPhoto(adminGroupId, order.payment_receipt_file_id, {
            caption: adminMessage,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                { text: '✅ تایید سفارش', callback_data: `approve_order_${order.id}` },
                { text: '❌ رد سفارش', callback_data: `reject_order_${order.id}` }
              ]]
            }
          });
        } else {
          // اگر به هر دلیلی عکس نداشت
          await bot.sendMessage(adminGroupId, adminMessage, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                { text: '✅ تایید سفارش', callback_data: `approve_order_${order.id}` },
                { text: '❌ رد سفارش', callback_data: `reject_order_${order.id}` }
              ]]
            }
          });
        }
        
        console.log(`📸 Reported pending order #${order.id} to admin group`);
      }
      
    } catch (error) {
      console.error('Error in pending order checker:', error);
    }
  }

  // متد برای حذف آیدی از گزارش‌شده‌ها (بعد از تایید/رد)
  removeReportedOrder(orderId: number) {
    this.reportedOrderIds.delete(orderId);
  }
}