import { Injectable } from '@nestjs/common';
import { PlanService } from '../../plan/services';
import { OrderService } from '../../order/services';
import { UserService } from '../../user/services';
import { StockService } from '../../stock/services';
import { AdminMiddleware } from '../../telegram/middlewares/admin.middleware';
import { ChannelMiddleware } from '../../telegram/middlewares/channel.middleware';
import { AdminStateManager } from '../states/admin.state';
import { MessageHelper } from '../utils/message.utils';
import { TelegramSender } from '../utils/telegram-sender';
import { getMainKeyboard } from '../keyboards/main.keyboard';

@Injectable()
export class UserHandler {
  constructor(
    private readonly planService: PlanService,
    private readonly orderService: OrderService,
    private readonly userService: UserService,
    private readonly stockService: StockService,
    private readonly adminMiddleware: AdminMiddleware,
    private readonly channelMiddleware: ChannelMiddleware,
    private readonly stateManager: AdminStateManager,
    private readonly sender: TelegramSender,
    private readonly messageHelper: MessageHelper,
  ) {}

  async handleStart(bot: any, chatId: number, userId: number, firstName: string, lastName?: string): Promise<void> {
    const isMember = await this.channelMiddleware.ensureMembership(bot, userId, chatId);
    if (!isMember) return;

    const isAdmin = this.adminMiddleware.isAdmin(userId);
    const fullName = lastName ? `${firstName} ${lastName}` : firstName;

    const message =
      `👋 سلام **${fullName}**\n\n` +
      `🎉 به ربات فروش VPN خوش اومدی!\n\n` +
      `🔐 **ویژگی‌های ما:**\n` +
      `• پایدار و قابل اعتماد\n` +
      `• اشتراک بدون ضریب\n` +
      `• سرعت بالا با سرور اختصاصی\n` +
      `• پشتیبانی ۲۴ ساعته\n` +
      `• پلن‌های متنوع و مقرون‌به‌صرفه\n\n` +
      `🚀 کافیه روی **خرید VPN** کلیک کنی و توی چند ثانیه وصل بشی!`;

    await this.sender.send(bot, chatId, message, getMainKeyboard(isAdmin, userId));
  }

  async showPlans(bot: any, chatId: number, userId: number, username?: string, firstName?: string, lastName?: string): Promise<void> {
    const isMember = await this.channelMiddleware.ensureMembership(bot, userId, chatId);
    if (!isMember) return;

    await this.userService.upsert(userId, username, firstName, lastName);

    const plans = await this.planService.findActiveCached();
    if (!plans.length) {
      await this.sender.send(bot, chatId, '⚠️ هیچ پلن فعالی وجود ندارد.');
      return;
    }

    const planButtons = plans.map((plan) => [{
      text: plan.has_discount && plan.discounted_price
        ? `🌟 ${plan.name} | 🏷️ ${plan.discounted_price.toLocaleString()} 🔥`
        : `💎 ${plan.name} | ${plan.price.toLocaleString()} ✨`,
      callback_data: `plan_${plan.id}`,
    }]);

    await this.sender.send(
      bot,
      chatId,
      `🛒 خرید VPN\n\n` +
      `👇 لطفاً یکی از پلن‌های زیر را انتخاب کنید:`,
      { reply_markup: { inline_keyboard: planButtons } },
    );
  }

  async selectPlan(
    bot: any,
    chatId: number,
    userId: number,
    planId: number,
    username?: string,
    firstName?: string,
    lastName?: string,
  ): Promise<void> {
    const hasPending = await this.orderService.hasPendingOrder(userId);
    if (hasPending) {
      await this.sender.send(bot, chatId, '⚠️ شما یک سفارش در انتظار تایید دارید.');
      return;
    }

    const plan = await this.planService.findById(planId);
    if (!plan || !plan.is_active) {
      await this.sender.send(bot, chatId, '❌ این پلن فعلا فعال نیست.');
      return;
    }

    /** Fix: use StockService.canPurchase() — correct stock check, not plan cache */
    const canPurchase = await this.stockService.canPurchase(planId);
    if (!canPurchase) {
      await this.sender.send(bot, chatId, '⚠️ متأسفانه این پلن به اتمام رسیده است.');
      return;
    }

    await this.userService.upsert(userId, username, firstName, lastName);

    const finalPrice = this.planService.getEffectivePrice(plan);
    const cardNumber = process.env.CARD_NUMBER ?? '**********';
    const fmt = (p: number) => (p * 1000).toLocaleString('en-US');

    const message =
      `💳 اطلاعات پرداخت\n\n` +
      `📦 پلن: ${plan.name}\n` +
      `💰 قیمت اصلی: ${fmt(plan.price)} تومان\n` +
      `✅ مبلغ نهایی: ${fmt(finalPrice)} تومان\n\n` +
      `💳 شماره کارت:\n${cardNumber}\n\n` +
      `👤 صاحب کارت:\n${process.env.CARD_HOLDER ?? 'نرگس کارگران'}\n\n` +
      `💰 مبلغ قابل پرداخت:\n` +
      `${fmt(finalPrice)} تومان\n\n` +
      `🖼 پس از پرداخت، تصویر رسید را ارسال کنید.`;

    const sent = await this.sender.send(bot, chatId, message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📤 ارسال رسید', callback_data: `send_receipt_${planId}` }],
          [{ text: '🔙 بازگشت', callback_data: 'buy' }],
        ],
      },
    });

    this.stateManager.set(userId, { action: 'waiting_for_receipt', planId, messageId: sent?.message_id });
  }

  async showUserServices(bot: any, chatId: number, userId: number): Promise<void> {
    const isMember = await this.channelMiddleware.ensureMembership(bot, userId, chatId);
    if (!isMember) return;

    const orders = await this.orderService.findApprovedByUser(userId);
    if (!orders.length) {
      await this.sender.send(bot, chatId, '📦 شما هنوز سرویسی خریداری نکرده‌اید.');
      return;
    }

    const buttons = await Promise.all(
      orders.map(async (order) => {
        const plan = await this.planService.findById(order.plan_id);
        return [{ text: `🛍️ ${plan?.name ?? order.plan_id}`, callback_data: `service_detail_${order.id}` }];
      }),
    );
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'main_menu' }]);

    await this.sender.send(bot, chatId, '🛍️ سرویس‌های من\n\nلیست سرویس‌های فعال شما:', {
      reply_markup: { inline_keyboard: buttons },
    });
  }

  async handleSupport(bot: any, chatId: number): Promise<void> {
    const supportId = process.env.SUPPORT_ID ?? '';
    await this.sender.send(
      bot,
      chatId,
      `💬 پشتیبانی و راهنمایی\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🤝 ساعات پاسخگویی:\n` +
      `🕘 ۹ صبح تا ۱۲ شب (همه روزه)\n\n` +
      `📌 نحوه ارتباط با ما:\n` +
      `برای ارتباط با تیم پشتیبانی، از راه‌های زیر استفاده کنید:\n\n` +
      `📱 آیدی پشتیبانی:\n` +
      `${supportId}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 تذکر مهم:\n` +
      `• لطفاً شماره سفارش خود را همراه پیام ارسال کنید\n` +
      `• پاسخگویی به ترتیب اولویت انجام می‌شود\n` +
      `• برای اطلاع از وضعیت سفارش، از بخش "سرویس‌های من" استفاده کنید\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `✨ ما همیشه کنار شما هستیم ✨`,
    );
  }

  async handleHowToConnect(bot: any, chatId: number): Promise<void> {
    await this.sender.send(bot, chatId, this.messageHelper.getConnectionGuide());
  }
}
