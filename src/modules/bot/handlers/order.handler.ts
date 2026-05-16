import { Injectable, Logger } from '@nestjs/common';
import { OrderService } from '../../order/services';
import { PlanService } from '../../plan/services';
import { SubService } from '../../sub/services';
import { AdminMiddleware } from '../../telegram/middlewares/admin.middleware';
import { ChannelMiddleware } from '../../telegram/middlewares/channel.middleware';
import { AdminStateManager } from '../states/admin.state';
import { TelegramSender } from '../utils/telegram-sender';
import { OrderStatus } from '../../order/entities/order.entity';
import { ordersManagementKeyboard } from '../keyboards/admin.keyboard';
import { PendingOrderCheckerService } from '../../order/services';
import { CouponService } from '../../coupon/services/coupon.service';

@Injectable()
export class OrderHandler {
  private readonly logger = new Logger(OrderHandler.name);

  constructor(
    private readonly orderService: OrderService,
    private readonly planService: PlanService,
    private readonly subService: SubService,
    private readonly adminMiddleware: AdminMiddleware,
    private readonly channelMiddleware: ChannelMiddleware,
    private readonly stateManager: AdminStateManager,
    private readonly sender: TelegramSender,
    private readonly pendingChecker: PendingOrderCheckerService,
    private readonly couponService: CouponService,
  ) {}

  async handleReceipt(bot: any, msg: any): Promise<void> {
    const chatId: number = msg.chat.id;
    const userId: number = msg.from.id;

    const isMember = await this.channelMiddleware.ensureMembership(bot, userId, chatId);
    if (!isMember) return;

    const hasPending = await this.orderService.hasPendingOrder(userId);
    if (hasPending) {
      await this.sender.send(bot, chatId, '⚠️ شما یک سفارش در انتظار تایید دارید.');
      return;
    }

    const state = this.stateManager.get(userId);
    if (state?.action !== 'waiting_for_receipt') {
      await this.sender.send(bot, chatId, '❌ لطفاً ابتدا از دکمه خرید استفاده کنید.');
      return;
    }

    const photo = msg.photo[msg.photo.length - 1];
    const plan = await this.planService.findById(state.planId);
    if (!plan) {
      await this.sender.send(bot, chatId, '❌ پلن مورد نظر یافت نشد.');
      this.stateManager.clear(userId);
      return;
    }

    // Apply coupon discount if present in state
    const couponData = state.data as { couponId?: number; couponPercent?: number } | undefined;
    const basePrice = this.planService.getEffectivePrice(plan);
    const finalAmount = couponData?.couponPercent
      ? this.couponService.applyDiscount(basePrice, couponData.couponPercent)
      : basePrice;

    try {
      const order = await this.orderService.createOrder({
        userId,
        planId: state.planId,
        amount: finalAmount,
        paymentReceiptFileId: photo.file_id,
        discountCodeId: couponData?.couponId ?? null,
      });

      // Mark coupon as used after order is created
      if (couponData?.couponId) {
        await this.couponService.markUsed(couponData.couponId).catch(() => {});
      }

      const adminGroupId = process.env.ADMIN_GROUP_ID;
      const username = msg.from.username
        ? `@${msg.from.username}`
        : `[${msg.from.first_name}](tg://user?id=${userId})`;

      const caption =
        `🆕 <b>سفارش جدید!</b>\n\n` +
        `👤 کاربر: ${username}\n` +
        `🆔 آیدی: <code>${userId}</code>\n` +
        `📦 پلن: ${plan.name}\n` +
        `💰 مبلغ: ${order.amount.toLocaleString()} تومان\n` +
        `🆔 شماره سفارش: #${order.id}\n` +
        `📅 تاریخ: ${new Date().toLocaleDateString('fa-IR')}`;

      if (adminGroupId) {
        try {
          const sent = await bot.sendPhoto(adminGroupId, photo.file_id, {
            caption,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                { text: '✅ تایید', callback_data: `approve_order_${order.id}` },
                { text: '❌ رد', callback_data: `reject_order_${order.id}` },
              ]],
            },
          });
          await this.orderService.saveAdminMessageId(order.id, String(sent.message_id));
        } catch (err) {
          this.logger.error(`Failed to notify admin group: ${err.message}`);
        }
      }

      await this.sender.send(bot, chatId, `✅ سفارش شما با شماره #${order.id} ثبت شد. پس از بررسی توسط ادمین، نتیجه به شما اطلاع داده می‌شود.`);
      this.stateManager.clear(userId);
    } catch (error) {
      this.logger.error(`createOrder failed: ${error.message}`);
      await this.sender.send(bot, chatId, '❌ خطا در ثبت سفارش. لطفاً دوباره تلاش کنید.');
    }
  }

  async showPaymentInfo(bot: any, chatId: number, userId: number, planId: number, couponPercent: number | null): Promise<void> {
    const plan = await this.planService.findById(planId);
    if (!plan) { await this.sender.send(bot, chatId, '❌ پلن یافت نشد.'); return; }

    const originalPrice = this.planService.getEffectivePrice(plan);
    const finalPrice = couponPercent ? Math.round(originalPrice * (1 - couponPercent / 100)) : originalPrice;
    const fmt = (p: number) => (p * 1000).toLocaleString('en-US');

    const discountLine = couponPercent
      ? `🏷️ تخفیف (${couponPercent}%): -${fmt(originalPrice - finalPrice)} تومان\n`
      : '';

    const message =
      `💳 اطلاعات پرداخت\n\n` +
      `📦 پلن: ${plan.name}\n` +
      `💰 قیمت اصلی: ${fmt(originalPrice)} تومان\n` +
      discountLine +
      `✅ مبلغ نهایی: <b>${fmt(finalPrice)} تومان</b>\n\n` +
      `💳 شماره کارت:\n${process.env.CARD_NUMBER ?? '**********'}\n\n` +
      `👤 صاحب کارت:\n${process.env.CARD_HOLDER ?? 'نرگس کارگران'}\n\n` +
      `🖼 پس از پرداخت، تصویر رسید را ارسال کنید.`;

    // preserve any coupon data already in state
    const existing = this.stateManager.get(userId);
    const sent = await this.sender.send(bot, chatId, message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📤 ارسال رسید', callback_data: `send_receipt_${planId}` }],
          [{ text: '🔙 بازگشت به پلن‌ها', callback_data: 'buy' }],
        ],
      },
    });

    this.stateManager.set(userId, {
      action: 'waiting_for_receipt',
      planId,
      messageId: sent?.message_id,
      data: existing?.data ?? {},
    });
  }

  async waitForReceipt(bot: any, chatId: number, userId: number, planId: number): Promise<void> {
    const state = this.stateManager.get(userId);
    if (state?.messageId) {
      await this.sender.editReplyMarkup(bot, chatId, state.messageId, { inline_keyboard: [] });
    }
    this.stateManager.set(userId, { action: 'waiting_for_receipt', planId });
    await this.sender.send(bot, chatId, '🖼 لطفاً تصویر رسید خود را ارسال کنید.');
  }

  async approveOrder(bot: any, adminChatId: number, adminId: number, orderId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(adminId)) return;

    try {
      /** Fix: fetch admin_message_id BEFORE approveOrder to avoid second DB hit */
      const existing = await this.orderService.findById(orderId);
      const adminMessageId = existing?.admin_message_id;

      const { order, config, plan } = await this.orderService.approveOrder(orderId);

      if (adminMessageId) {
        // The photo was sent to adminGroupId — always edit there, not the caller's chatId
        const targetChatId = Number(process.env.ADMIN_GROUP_ID ?? adminChatId);
        await this.sender.editReplyMarkup(bot, targetChatId, parseInt(adminMessageId), { inline_keyboard: [] });
      }

      const subLink = await this.subService.getSub();
      const isDirectLink = config.config_link.startsWith('vmess://') ||
        config.config_link.startsWith('vless://') ||
        config.config_link.startsWith('trojan://') ||
        config.config_link.startsWith('ss://');
      const finalLink = isDirectLink ? config.config_link : `${subLink ?? ''}${config.config_link}`;

      await this.sender.send(
        bot,
        order.user_id,
        `🎉 تبریک! 🎉\n\n` +
        `✅ سفارش شما با موفقیت تایید شد!\n\n` +
        `📦 پلن: ${plan.name}\n` +
        `💰 مبلغ: ${order.amount.toLocaleString()} تومان\n` +
        `🔗 **لینک اشتراک شما:**\n` +
        `<code>${finalLink}</code>\n\n` +
        `📌 برای کپی کردن، روی لینک کلیک کنید.`,
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

      this.pendingChecker.removeReportedOrder(orderId);
      await this.sender.send(bot, adminChatId, `✅ سفارش #${orderId} تایید شد.`);
    } catch (error) {
      await this.sender.send(bot, adminChatId, `❌ ${error.message}`);
    }
  }

  async rejectOrder(bot: any, adminChatId: number, adminId: number, orderId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(adminId)) return;

    try {
      /** Fix: fetch admin_message_id BEFORE rejectOrder to avoid second DB hit */
      const existing = await this.orderService.findById(orderId);
      const adminMessageId = existing?.admin_message_id;

      const order = await this.orderService.rejectOrder(orderId);

      if (adminMessageId) {
        // The photo was sent to adminGroupId — always edit there, not the caller's chatId
        const targetChatId = Number(process.env.ADMIN_GROUP_ID ?? adminChatId);
        await this.sender.editReplyMarkup(bot, targetChatId, parseInt(adminMessageId), { inline_keyboard: [] });
      }

      await this.sender.send(
        bot,
        order.user_id,
        `❌ **متأسفانه** ❌\n\n` +
        `سفارش شما تایید نشد.\n\n` +
        `📞 لطفاً با پشتیبانی تماس بگیرید.`,
        { reply_markup: { inline_keyboard: [[{ text: '🏠 بازگشت به صفحه اصلی', callback_data: 'main_menu' }]] } },
      );

      this.pendingChecker.removeReportedOrder(orderId);
      await this.sender.send(bot, adminChatId, `✅ سفارش #${orderId} رد شد.`);
    } catch (error) {
      await this.sender.send(bot, adminChatId, `❌ ${error.message}`);
    }
  }

  async viewReceipt(bot: any, chatId: number, userId: number, orderId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;

    const order = await this.orderService.findByIdWithRelations(orderId);
    if (!order?.payment_receipt_file_id) {
      await this.sender.send(bot, chatId, '❌ سفارش یا فیش پرداختی یافت نشد.');
      return;
    }

    const userDisplay = order.user?.username
      ? `@${order.user.username}`
      : order.user?.first_name ?? String(order.user_id);

    const caption =
      `🆔 **سفارش #${order.id}**\n` +
      `👤 کاربر: ${userDisplay}\n` +
      `📦 پلن: ${order.plan?.name}\n` +
      `💰 مبلغ: ${order.amount.toLocaleString()} تومان\n` +
      `📅 تاریخ: ${new Date(order.created_at).toLocaleDateString('fa-IR')}\n\n` +
      `✅ برای تایید یا رد، از دکمه‌های زیر استفاده کنید.`;

    await bot.sendPhoto(chatId, order.payment_receipt_file_id, {
      caption,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ تایید سفارش', callback_data: `admin_approve_order_${order.id}` },
            { text: '❌ رد سفارش', callback_data: `admin_reject_order_${order.id}` },
          ],
          [{ text: '🔙 بازگشت به لیست', callback_data: 'admin_pending_orders' }],
        ],
      },
    });
  }

  async sendConfigLink(bot: any, chatId: number, userId: number, orderId: number): Promise<void> {
    const order = await this.orderService.findByIdWithRelations(orderId);
    if (!order || order.user_id !== userId || order.status !== OrderStatus.APPROVED) {
      await this.sender.send(bot, chatId, '❌ سفارش یافت نشد یا تایید نشده است.');
      return;
    }

    const subLink = await this.subService.getSub();
    const isDirectLink = order.config?.config_link?.startsWith('vmess://') ||
      order.config?.config_link?.startsWith('vless://') ||
      order.config?.config_link?.startsWith('trojan://') ||
      order.config?.config_link?.startsWith('ss://');
    const finalLink = isDirectLink
      ? (order.config?.config_link ?? '')
      : `${subLink ?? ''}${order.config?.config_link ?? ''}`;

    await this.sender.send(
      bot,
      chatId,
      `🔗 لینک اشتراک شما\n\n` +
      `📦 پلن: ${order.plan?.name}\n` +
      `<code>${finalLink}</code>\n\n` +
      `📌 برای کپی کردن، روی لینک کلیک کنید.`,
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

  async showOrdersManagement(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;

    const [pending, approved, rejected] = await Promise.all([
      this.orderService.countByStatus(OrderStatus.PENDING),
      this.orderService.countByStatus(OrderStatus.APPROVED),
      this.orderService.countByStatus(OrderStatus.REJECTED),
    ]);

    await this.sender.send(
      bot,
      chatId,
      `📋 مدیریت سفارشات\n\n📊 آمار سفارشات:\n• ⏳ در انتظار: ${pending}\n• ✅ تایید شده: ${approved}\n• ❌ رد شده: ${rejected}\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:`,
      ordersManagementKeyboard,
    );
  }

  async listOrders(bot: any, chatId: number, userId: number, status?: OrderStatus): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;

    const orders = status !== undefined
      ? await this.orderService.findAllByStatus(status)
      : await this.orderService.findAll();

    if (!orders.length) {
      await this.sender.send(bot, chatId, '⚠️ هیچ سفارشی یافت نشد.');
      return;
    }

    const statusIcon = (s: OrderStatus) =>
      s === OrderStatus.PENDING ? '⏳' : s === OrderStatus.APPROVED ? '✅' : '❌';

    const lines = orders.map((o) => {
      const user = o.user?.username ? `@${o.user.username}` : o.user?.first_name ?? String(o.user_id);
      return `${statusIcon(o.status)} #${o.id} | ${user} | ${o.plan?.name} | ${o.amount.toLocaleString()} تومان`;
    });

    await this.sender.send(bot, chatId, `📋 لیست سفارشات\n\n${lines.join('\n')}`);
  }

  async listPendingOrders(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;

    const orders = await this.orderService.findByStatus(OrderStatus.PENDING);
    if (!orders.length) {
      await this.sender.send(bot, chatId, '⚠️ هیچ سفارش در انتظاری وجود ندارد.');
      return;
    }

    const buttons = orders.map((o) => [
      { text: `📸 مشاهده فیش سفارش #${o.id}`, callback_data: `admin_view_receipt_${o.id}` },
    ]);
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_orders_menu' }]);

    await this.sender.send(bot, chatId, `📋 **سفارشات در انتظار تایید (${orders.length} عدد)**`, {
      reply_markup: { inline_keyboard: buttons },
    });
  }

  async listApprovedOrders(bot: any, chatId: number, userId: number): Promise<void> {
    await this.listOrders(bot, chatId, userId, OrderStatus.APPROVED);
  }

  async listRejectedOrders(bot: any, chatId: number, userId: number): Promise<void> {
    await this.listOrders(bot, chatId, userId, OrderStatus.REJECTED);
  }
}
