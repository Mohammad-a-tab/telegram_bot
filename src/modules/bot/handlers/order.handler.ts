// src/modules/bot/handlers/order.handler.ts

import { BotService } from '../bot.service';
import { ordersManagementKeyboard } from '../keyboards/admin.keyboard';

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
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const photo = msg.photo[msg.photo.length - 1];
    const plan = await this.botService.planRepo.findOne({ where: { id: state.planId } });
    
    if (!plan) {
      await this.botService.sendMessage(chatId, '❌ پلن مورد نظر یافت نشد.');
      this.botService.clearAdminState(userId);
      return;
    }
    
    const order = this.botService.orderRepo.create({
      user_id: userId,
      plan_id: state.planId,
      amount: plan.has_discount && plan.discounted_price ? plan.discounted_price : plan.price,
      payment_receipt_file_id: photo.file_id,
      status: 0,
    });
    
    const savedOrder = await this.botService.orderRepo.save(order);
    await this.botService.cache.set(`pending_order_${userId}`, { orderId: savedOrder.id }, 86400);
    
    const adminGroupId = process.env.ADMIN_GROUP_ID;
    const username = msg.from.username ? `@${msg.from.username}` : `[${msg.from.first_name}](tg://user?id=${userId})`;
    
    const adminMessage = 
      `🆕 **سفارش جدید!**\n\n` +
      `👤 کاربر: ${username}\n` +
      `🆔 آیدی: <code>${userId}</code>\n` +
      `📦 پلن: ${plan.name}\n` +
      `💰 مبلغ: ${savedOrder.amount.toLocaleString()} تومان\n` +
      `🆔 شماره سفارش: #${savedOrder.id}\n` +
      `📅 تاریخ: ${new Date().toLocaleDateString('fa-IR')}`;
    
    if (adminGroupId) {
      const sentMessage = await this.botService.bot.sendPhoto(adminGroupId, photo.file_id, {
        caption: adminMessage,
        parse_mode: 'HTML',
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
  }

  async waitForReceipt(chatId: number, userId: number, data: string) {
    const planId = parseInt(data.split('_')[2]);
    this.botService.setAdminState(userId, { action: 'waiting_for_receipt', planId });
    await this.botService.sendMessage(chatId, '🖼 لطفاً تصویر رسید خود را ارسال کنید.');
  }

  async approveOrder(data: string, adminChatId: number, adminId: number) {
    const orderId = parseInt(data.split('_')[2]);
    const order = await this.botService.orderRepo.findOne({ 
      where: { id: orderId }, 
      relations: ['plan', 'user']
    });
    
    if (!order) {
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
    
    const config = await this.botService.stock.reserveConfig(order.plan_id);
    if (!config) {
      await this.botService.sendMessage(adminChatId, '❌ کانفیگ به اتمام رسیده است.');
      await this.botService.sendMessage(order.user_id, '❌ متأسفانه کانفیگ مورد نظر به اتمام رسیده است.');
      return;
    }
    
    order.status = 1;
    order.config_id = config.id;
    order.approved_at = new Date();
    await this.botService.orderRepo.save(order);
    
    config.is_sold_out = true;
    await this.botService.configRepo.save(config);
    await this.botService.cache.del(`pending_order_${order.user_id}`);
    
    const subLink = await this.botService.sub.getSub();
    const configLink = config.config_link;
    
    let message = `🎉 **تبریک!** 🎉\n\n✅ سفارش شما با موفقیت تایید شد!\n\n`;
    message += `🔗 **کانفیگ شما:**\n\`${configLink}\`\n\n`;
    if (subLink) {
      message += `🔗 **لینک اشتراک:**\n\`${subLink}${configLink}\`\n\n`;
    }
    message += `📌 برای کپی کردن، روی لینک کلیک کنید.`;
    
    await this.botService.sendMessage(order.user_id, message, { parse_mode: 'Markdown' });
    await this.botService.sendMessage(adminChatId, `✅ سفارش #${order.id} تایید شد.`);
  }

  async rejectOrder(data: string, adminChatId: number, adminId: number) {
    const orderId = parseInt(data.split('_')[2]);
    const order = await this.botService.orderRepo.findOne({ where: { id: orderId } });
    
    if (!order) {
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
    await this.botService.orderRepo.save(order);
    await this.botService.cache.del(`pending_order_${order.user_id}`);
    
    await this.botService.sendMessage(order.user_id, '❌ متأسفانه سفارش شما تایید نشد. لطفاً با پشتیبانی تماس بگیرید.');
    await this.botService.sendMessage(adminChatId, `✅ سفارش #${order.id} رد شد.`);
  }

  async sendConfigLink(chatId: number, userId: number, orderId: number) {
    const order = await this.botService.orderRepo.findOne({ 
      where: { id: orderId, user_id: userId },
      relations: ['config']
    });
    
    if (!order || order.status !== 1) {
      await this.botService.sendMessage(chatId, '❌ سفارش یافت نشد یا هنوز تایید نشده است.');
      return;
    }
    
    const subLink = await this.botService.sub.getSub();
    const configLink = order.config?.config_link || '';
    
    await this.botService.sendMessage(chatId, 
      `🔗 **لینک اشتراک شما**\n\n\`${subLink}${configLink}\`\n\n📌 برای کپی کردن، روی لینک کلیک کنید.`,
      { parse_mode: 'Markdown' }
    );
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
      relations: ['plan']
    });
    
    if (!orders.length) {
      const statusText = status === 0 ? 'در انتظار' : status === 1 ? 'تایید شده' : status === 2 ? 'رد شده' : '';
      await this.botService.sendMessage(chatId, `⚠️ هیچ سفارش ${statusText}ی وجود ندارد.`);
      return;
    }
    
    let message = '📋 **لیست سفارشات**\n\n';
    for (const order of orders) {
      const statusText = order.status === 0 ? '⏳ در انتظار' : order.status === 1 ? '✅ تایید شده' : '❌ رد شده';
      message += `🆔 سفارش #${order.id}\n`;
      message += `👤 کاربر: ${order.user_id}\n`;
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
      `📋 **مدیریت سفارشات**\n\n📊 آمار سفارشات:\n• ⏳ در انتظار: ${pendingCount}\n• ✅ تایید شده: ${approvedCount}\n• ❌ رد شده: ${rejectedCount}\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:`,
      { parse_mode: 'Markdown', ...ordersManagementKeyboard }
    );
  }
}