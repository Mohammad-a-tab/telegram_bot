import { BotService } from '../bot.service';
import { ordersManagementKeyboard } from '../keyboards/admin.keyboard';
import { Plan } from '../../plan/entities/plan.entity';
import { Order } from '../../order/entities/order.entity';
import { Config } from 'src/modules/config/entities/config.entity';

export class OrderHandler {
  constructor(private readonly botService: BotService) {}

  async handleReceipt(msg: any) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    const isMember = await this.botService.ensureMembership(userId, chatId);
    if (!isMember) return;
    
    const hasPending = await this.botService.cache.get(`pending_order_${userId}`);
    if (hasPending) {
      await this.botService.sendMessage(chatId, '⚠️ شما یک سفارش در انتظار تایید دارید.');
      return;
    }
  
    const state = this.botService.getAdminState(userId);
    if (!state || state.action !== 'waiting_for_receipt') {
      await this.botService.sendMessage(chatId, '❌ لطفاً ابتدا از دکمه خرید استفاده کنید.');
      return;
    }
  
    await this.processReceipt(msg, state);
  }

  private async processReceipt(msg: any, state: any) {
    const queryRunner = this.botService.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
  
    try {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const photo = msg.photo[msg.photo.length - 1];
      
      if (state.messageId) {
        try {
          await this.botService.bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            { chat_id: chatId, message_id: state.messageId }
          );
        } catch (error) {
          console.error('Failed to remove send receipt button:', error.message);
        }
      }
      
      const plan = await queryRunner.manager.findOne(Plan, {
        where: { id: state.planId },
        lock: { mode: 'pessimistic_write' }
      });
      
      if (!plan) {
        await queryRunner.rollbackTransaction();
        await this.botService.sendMessage(chatId, '❌ پلن مورد نظر یافت نشد.');
        this.botService.clearAdminState(userId);
        return;
      }
      
      const order = queryRunner.manager.create(Order, {
        user_id: userId,
        plan_id: state.planId,
        amount: plan.has_discount && plan.discounted_price ? plan.discounted_price : plan.price,
        payment_receipt_file_id: photo.file_id,
        status: 0,
      });
      
      const savedOrder = await queryRunner.manager.save(order);
      await queryRunner.commitTransaction();
      
      await this.botService.cache.set(`pending_order_${userId}`, { orderId: savedOrder.id }, 86400);
      
      const adminGroupId = process.env.ADMIN_GROUP_ID;
      const username = msg.from.username ? `@${msg.from.username}` : `[${msg.from.first_name}](tg://user?id=${userId})`;
      
      const adminMessage = 
        `🆕 سفارش جدید!\n\n` +
        `👤 کاربر: ${username}\n` +
        `🆔 آیدی: <cod${userId}\n` +
        `📦 پلن: ${plan.name}\n` +
        `💰 مبلغ: ${savedOrder.amount.toLocaleString()} تومان\n` +
        `🆔 شماره سفارش: #${savedOrder.id}\n` +
        `📅 تاریخ: ${new Date().toLocaleDateString('fa-IR')}`;
      
      if (adminGroupId) {
        const sentMessage = await this.botService.bot.sendPhoto(adminGroupId, photo.file_id, {
          caption: adminMessage,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ تایید سفارش', callback_data: `approve_order_${savedOrder.id}` },
              { text: '❌ رد سفارش', callback_data: `reject_order_${savedOrder.id}` }
            ]]
          }
        });
        
        savedOrder.admin_message_id = sentMessage.message_id;
        await this.botService.orderRepo.save(savedOrder);
      }
      
      await this.botService.sendMessage(chatId, `✅ سفارش شما با شماره #${savedOrder.id} ثبت شد. پس از بررسی، نتیجه به شما اطلاع داده می‌شود.`);
      this.botService.clearAdminState(userId);
      
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error processing receipt:', error);
      await this.botService.sendMessage(msg.chat.id, '❌ خطا در ثبت سفارش. لطفاً دوباره تلاش کنید.');
    } finally {
      await queryRunner.release();
    }
  }

  async waitForReceipt(chatId: number, userId: number, data: string) {
    const planId = parseInt(data.split('_')[2]);
    const state = this.botService.getAdminState(userId);

    if (state?.messageId) {
      try {
        await this.botService.bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          { chat_id: chatId, message_id: state.messageId }
        );
      } catch (error) {
        console.error('Failed to remove send receipt button:', error.message);
      }
    }
    
    this.botService.setAdminState(userId, { action: 'waiting_for_receipt', planId });
    await this.botService.sendMessage(chatId, '🖼 لطفاً تصویر رسید خود را ارسال کنید.');
  }

  async approveOrder(data: string, adminChatId: number, adminId: number) {
    const orderId = parseInt(data.split('_')[2]);
    
    const queryRunner = this.botService.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
  
    try {
      const order = await queryRunner.manager.findOne(Order, { 
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' }
      });
      
      if (!order) {
        await queryRunner.rollbackTransaction();
        await this.botService.sendMessage(adminChatId, '❌ سفارش یافت نشد.');
        return;
      }
      
      const plan = await queryRunner.manager.findOne(Plan, {
        where: { id: order.plan_id },
        lock: { mode: 'pessimistic_write' }
      });
      
      if (!plan) {
        await queryRunner.rollbackTransaction();
        await this.botService.sendMessage(adminChatId, '❌ پلن یافت نشد.');
        return;
      }
      
      const config = await queryRunner.manager.findOne(Config, {
        where: { plan_id: plan.id, is_sold_out: false },
        lock: { mode: 'pessimistic_write' }
      });
      
      if (!config) {
        await queryRunner.rollbackTransaction();
        await this.botService.sendMessage(adminChatId, '❌ کانفیگ به اتمام رسیده است.');
        await this.botService.sendMessage(order.user_id, '❌ متأسفانه کانفیگ مورد نظر به اتمام رسیده است.');
        return;
      }
      
      if (order.admin_message_id) {
        try {
          await this.botService.bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            { chat_id: adminChatId, message_id: order.admin_message_id }
          );
        } catch (error) {
          console.error('Failed to remove buttons:', error.message);
        }
      }
      
      config.is_sold_out = true;
      await queryRunner.manager.save(config);
      
      if (plan.stock > 0) {
        plan.stock = plan.stock - 1;
        await queryRunner.manager.save(plan);
      }
      
      order.status = 1;
      order.config_id = config.id;
      order.approved_at = new Date();
      await queryRunner.manager.save(order);
      
      await queryRunner.commitTransaction();
      
      await this.botService.cache.del(`pending_order_${order.user_id}`);
      await this.botService.cache.del(`available_config_${plan.id}`);
      await this.botService.cache.del(`can_purchase_${plan.id}`);
      await this.botService.cache.del(`remaining_stock_${plan.id}`);
      
      const subLink = await this.botService.sub.getSub();
      const finalLink = `${subLink}${config.config_link}`;
      
      const message = 
        `🎉 تبریک! 🎉\n\n` +
        `✅ سفارش شما با موفقیت تایید شد!\n\n` +
        `📦 پلن: ${plan.name}\n` +
        `💰 مبلغ: ${order.amount.toLocaleString()} تومان\n` +
        `🔗 لینک اشتراک شما:\n` +
        `<code>${finalLink}</code>\n\n` +
        `📌 برای کپی کردن، روی لینک کلیک کنید.`;
      
      await this.botService.sendMessage(order.user_id, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔧 نحوه اتصال', callback_data: 'how_to_connect' }],
            [{ text: '🏠 بازگشت به صفحه اصلی', callback_data: 'main_menu' }]
          ]
        }
      });
      
      await this.botService.sendMessage(adminChatId, `✅ سفارش #${order.id} تایید شد.`);
      
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error approving order:', error);
      await this.botService.sendMessage(adminChatId, `❌ خطا در تایید سفارش: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async rejectOrder(data: string, adminChatId: number, adminId: number) {
    const orderId = parseInt(data.split('_')[2]);
    
    const queryRunner = this.botService.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const order = await queryRunner.manager.findOne(Order, { 
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' }
      });
      
      if (!order) {
        await queryRunner.rollbackTransaction();
        await this.botService.sendMessage(adminChatId, '❌ سفارش یافت نشد.');
        return;
      }
      
      if (order.admin_message_id) {
        try {
          await this.botService.bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            { chat_id: adminChatId, message_id: order.admin_message_id }
          );
        } catch (error) {
          console.error('Failed to remove buttons:', error.message);
        }
      }
      
      order.status = 2;
      await queryRunner.manager.save(order);
      await queryRunner.commitTransaction();
      
      await this.botService.cache.del(`pending_order_${order.user_id}`);
      await this.botService.sendMessage(order.user_id, '❌ متأسفانه سفارش شما تایید نشد. لطفاً با پشتیبانی تماس بگیرید.');
      await this.botService.sendMessage(adminChatId, `✅ سفارش #${order.id} رد شد.`);
      
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error rejecting order:', error);
      await this.botService.sendMessage(adminChatId, '❌ خطا در رد سفارش.');
    } finally {
      await queryRunner.release();
    }
  }

  async sendConfigLink(chatId: number, userId: number, orderId: number) {
    const order = await this.botService.orderRepo.findOne({ 
      where: { id: orderId, user_id: userId },
      relations: ['config', 'plan']
    });
    
    if (!order || order.status !== 1) {
      await this.botService.sendMessage(chatId, '❌ سفارش یافت نشد یا هنوز تایید نشده است.');
      return;
    }
    
    const subLink = await this.botService.sub.getSub();
    const configLink = order.config?.config_link || '';
    const finalLink = `${subLink}${configLink}`;
    const volumeText = `${ order.plan?.bandwidth_value}  ${ order.plan?.bandwidth_unit}` ;
    
    const message = 
      `🔗 لینک اشتراک شما\n\n` +
      `📦 پلن: ${order.plan?.name}\n` +
      `${volumeText ? `📊 حجم: ${volumeText}\n` : ''}` +
      `<code>${finalLink}</code>\n\n` +
      `📌 برای کپی کردن، روی لینک کلیک کنید.`;
    
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

  async listAllOrders(chatId: number, userId: number) { 
    await this.listOrdersByStatus(chatId, userId, null); 
  }
  
  async listPendingOrders(chatId: number, userId: number) { 
    await this.listOrdersByStatus(chatId, userId, 0); 
  }
  
  async listApprovedOrders(chatId: number, userId: number) { 
    await this.listOrdersByStatus(chatId, userId, 1); 
  }
  
  async listRejectedOrders(chatId: number, userId: number) { 
    await this.listOrdersByStatus(chatId, userId, 2); 
  }

  private async listOrdersByStatus(chatId: number, userId: number, status: number | null) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    
    const where: any = status !== null ? { status } : {};
    const orders = await this.botService.orderRepo.find({
      where,
      order: { created_at: 'DESC' },
      take: 20,
      relations: ['plan', 'user']
    });
    
    if (!orders.length) {
      const statusText = status === 0 ? 'در انتظار' : status === 1 ? 'تایید شده' : status === 2 ? 'رد شده' : '';
      await this.botService.sendMessage(chatId, `⚠️ هیچ سفارش ${statusText}ی وجود ندارد.`);
      return;
    }
    
    let message = '📋 لیست سفارشات\n\n';
    for (const order of orders) {
      const statusText = order.status === 0 ? '⏳ در انتظار' : order.status === 1 ? '✅ تایید شده' : '❌ رد شده';
      const userDisplay = order.user?.username ? `@${order.user.username}` : (order.user?.first_name || order.user_id);
      
      message += `🆔 سفارش #${order.id}\n`;
      message += `👤 کاربر: ${userDisplay}\n`;
      message += `📦 پلن: ${order.plan?.name || 'نامشخص'}\n`;
      message += `💰 مبلغ: ${order.amount.toLocaleString()} تومان\n`;
      message += `📊 وضعیت: ${statusText}\n`;
      message += `📅 تاریخ: ${new Date(order.created_at).toLocaleDateString('fa-IR')}\n\n`;
    }
    
    await this.botService.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }

  async showOrdersManagement(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    
    const pendingCount = await this.botService.orderRepo.count({ where: { status: 0 } });
    const approvedCount = await this.botService.orderRepo.count({ where: { status: 1 } });
    const rejectedCount = await this.botService.orderRepo.count({ where: { status: 2 } });
    
    await this.botService.sendMessage(chatId, 
      `📋 مدیریت سفارشات\n\n📊 آمار سفارشات:\n• ⏳ در انتظار: ${pendingCount}\n• ✅ تایید شده: ${approvedCount}\n• ❌ رد شده: ${rejectedCount}\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:`,
      { parse_mode: 'Markdown', ...ordersManagementKeyboard }
    );
  }
}