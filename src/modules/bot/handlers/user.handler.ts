import { BotService } from '../bot.service';
import { getMainKeyboard } from '../keyboards/main.keyboard';

export class UserHandler {
  constructor(private readonly botService: BotService) {}

  async handleStart(chatId: number, userId: number, firstName: string, lastName?: string) {
    const isMember = await this.botService.ensureMembership(userId, chatId);
    if (!isMember) return;
  
    const isAdmin = await this.botService.adminMiddleware.isAdmin(userId);
    const keyboard = getMainKeyboard(isAdmin);
    
    const fullName = lastName ? `${firstName} ${lastName}` : firstName;
    
    const message = 
      `👋 سلام **${fullName}**\n\n` +
      `🎉 به ربات فروش VPN خوش اومدی!\n\n` +
      `🔐 **ویژگی‌های ما:**\n` +
      `• پایدار و قابل اعتماد\n` +
      `• سرعت بالا با سرور اختصاصی\n` +
      `• پشتیبانی ۲۴ ساعته\n` +
      `• پلن‌های متنوع و مقرون‌به‌صرفه\n\n` +
      `🚀 کافیه روی **خرید VPN** کلیک کنی و توی چند ثانیه وصل بشی!`;
    
    await this.botService.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      ...keyboard
    });
  }

  async showPlans(chatId: number, userId: number, username?: string, firstName?: string, lastName?: string) {
    if (!await this.botService.ensureMembership(userId, chatId)) return;
  
    await this.botService.upsertUser(userId, username, firstName, lastName);
  
    let plans = await this.botService.cache.getPlans();
    if (!plans) {
      plans = await this.botService.planRepo.find({ where: { is_active: true }, order: { price: 'ASC' } });
      await this.botService.cache.setPlans(plans);
    }
  
    if (!plans.length) {
      await this.botService.sendMessage(chatId, '⚠️ هیچ پلن فعالی وجود ندارد.');
      return;
    }
  
    const headerMessage = 
      `🛒 **خرید VPN**\n\n` +
      `🎉 **جشنواره ۳ روزه تخفیف‌های ویژه** 🎉\n` +
      `به مناسبت جشنواره، تمام پلن‌ها با تخفیف ویژه عرضه می‌شوند.\n` +
      `فرصت رو از دست ندهید! 🚀\n\n` +
      `👇 لطفاً یکی از پلن‌های زیر را انتخاب کنید:`;
  
    const planButtons = plans.map(plan => {
      let buttonText = '';
      if (plan.has_discount && plan.discounted_price) {
        const percent = Math.round(((plan.price - plan.discounted_price) / plan.price) * 100);
        buttonText = `📦 ${plan.name} 💰${plan.price.toLocaleString()} ← 💎${plan.discounted_price.toLocaleString()} (-${percent}%) 🔥`;
      } else {
        buttonText = `📦 ${plan.name} 💰${plan.price.toLocaleString()}`;
      }
      return [{ text: buttonText, callback_data: `plan_${plan.id}` }];
    });
  
    await this.botService.sendMessage(chatId, headerMessage, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: planButtons,
      },
    });
  }
  
  async selectPlan(chatId: number, userId: number, data: string, username?: string, firstName?: string, lastName?: string) {
    const planId = parseInt(data.split('_')[1]);
    const pendingKey = `pending_order_${userId}`;
    const existingPending = await this.botService.cache.get(pendingKey);
    
    if (existingPending) {
      await this.botService.sendMessage(chatId, '⚠️ شما یک سفارش در انتظار تایید دارید.');
      return;
    }
    
    const plan = await this.botService.planRepo.findOne({ where: { id: planId } });
    if (!plan) {
      await this.botService.sendMessage(chatId, '❌ پلن مورد نظر یافت نشد.');
      return;
    }
    
    const canPurchase = await this.botService.stock.canPurchase(planId);
    if (!canPurchase) {
      await this.botService.sendMessage(chatId, '⚠️ متأسفانه این پلن به اتمام رسیده است.');
      return;
    }
    
    await this.botService.upsertUser(userId, username, firstName, lastName);
    
    this.botService.setAdminState(userId, { action: 'waiting_for_receipt', planId });
    const finalPrice = plan.has_discount && plan.discounted_price ? plan.discounted_price : plan.price;
    const cardNumber = process.env.CARD_NUMBER || '**********';
    const cardHolder = 'نرگس کارگران';
    const formatPrice = (price: number) => price.toLocaleString('fa-IR');
  
    const message = 
      `💳 اطلاعات پرداخت\n\n` +
      `📦 پلن: ${plan.name}\n` +
      `💰 قیمت اصلی: ${formatPrice(plan.price)} تومان\n` +
      `✅ مبلغ نهایی: ${formatPrice(finalPrice)} تومان\n\n` +
      `💳 شماره کارت:\n` +
      `<code>${cardNumber}</code>\n\n` +
      `👤 صاحب کارت:**\n${cardHolder}\n\n` +
      `💰 مبلغ قابل پرداخت:\n` +
      `*${formatPrice(finalPrice)} تومان*\n\n` +
      `🖼 پس از پرداخت، تصویر رسید را ارسال کنید.`;

    const sentMessage = await this.botService.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📤 ارسال رسید', callback_data: `send_receipt_${planId}` }],
          [{ text: '🔙 بازگشت', callback_data: 'buy' }]
        ]
      }
    });
    
    this.botService.setAdminState(userId, { 
      action: 'waiting_for_receipt', 
      planId,
      messageId: sentMessage.message_id 
    });
  }

  async showUserServices(chatId: number, userId: number) {
    if (!await this.botService.ensureMembership(userId, chatId)) return;
  
    const orders = await this.botService.orderRepo.find({
      where: { user_id: userId, status: 1 },
      order: { created_at: 'DESC' }
    });
  
    if (!orders.length) {
      await this.botService.sendMessage(chatId, '📦 شما هنوز سرویسی خریداری نکرده‌اید.');
      return;
    }
  
    const services = [];
    for (const order of orders) {
      const plan = await this.botService.planRepo.findOne({ where: { id: order.plan_id } });
      if (plan) services.push({ id: order.id, name: plan.name });
    }
  
    const inlineKeyboard = services.map(s => [{ text: `🛍️ ${s.name}`, callback_data: `service_detail_${s.id}` }]);
    inlineKeyboard.push([{ text: '🔙 بازگشت', callback_data: 'main_menu' }]);
  
    await this.botService.sendMessage(chatId, '🛍️ سرویس‌های من\n\nلیست سرویس‌های فعال شما:', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: inlineKeyboard }
    });
  }

  async handleSupport(chatId: number) {
    const supportId = process.env.SUPPORT_ID;
    
    const message = 
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
      `✨ ما همیشه کنار شما هستیم ✨`;
  
      await this.botService.sendMessage(chatId, message, { parse_mode: 'HTML' });
  }

  async handleHowToConnect(chatId: number) {
    const guide = this.botService.messageHelper.getConnectionGuide();
    await this.botService.sendMessage(chatId, guide, { parse_mode: 'Markdown' });
  }
}