import { BotService } from '../bot.service';
import { getMainKeyboard, getPlanKeyboard } from '../keyboards/main.keyboard';

export class UserHandler {
  constructor(private readonly botService: BotService) {}

  async handleStart(chatId: number, userId: number, firstName: string) {
    const isMember = await this.botService.ensureMembership(userId, chatId);
    if (!isMember) return;
  
    const isAdmin = await this.botService.adminMiddleware.isAdmin(userId);
    const keyboard = getMainKeyboard(isAdmin);
    
    const message = `👋 سلام ${firstName}!\n\n🎉 به ربات ما خوش آمدید!\n\n🔐 شما میتوانید از ما VPN با قیمت مناسب و کیفیت بالا تهیه کنید.`;
    await this.botService.sendMessage(chatId, message, keyboard);
  }

  async showPlans(chatId: number, userId: number) {
    if (!await this.botService.ensureMembership(userId, chatId)) return;
    await this.botService.upsertUser(userId);
  
    let plans = await this.botService.cache.getPlans();
    if (!plans) {
      plans = await this.botService.planRepo.find({ where: { is_active: true }, order: { price: 'ASC' } });
      await this.botService.cache.setPlans(plans);
    }
  
    if (!plans.length) {
      await this.botService.sendMessage(chatId, '⚠️ هیچ پلن فعالی وجود ندارد.');
      return;
    }
  
    const keyboard = getPlanKeyboard(plans);
    await this.botService.sendMessage(chatId, '🎯 لطفاً یکی از پلن‌های زیر را انتخاب کنید:', keyboard);
  }

  async selectPlan(chatId: number, userId: number, data: string) {
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
    
    this.botService.setAdminState(userId, { action: 'waiting_for_receipt', planId });
    
    const displayPrice = plan.has_discount && plan.discounted_price ? plan.discounted_price : plan.price;
    const cardNumber = process.env.CARD_NUMBER || '**********';
    const cardHolder = process.env.CARD_HOLDER || '**********';
    
    const message = `📋 **مشخصات پلن انتخاب شده**\n\n📌 نام: ${plan.name}\n💰 قیمت: ${displayPrice.toLocaleString()} تومان${plan.has_discount ? ` (قیمت اصلی: ${plan.price.toLocaleString()})` : ''}\n⏱ مدت: ${plan.duration_days} روز\n📊 حجم: ${plan.bandwidth_gb === 0 ? '♾️ نامحدود' : plan.bandwidth_gb + ' گیگابایت'}\n\n✅ پس از واریز، تصویر رسید را ارسال کنید.`;
    
    await this.botService.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📤 ارسال رسید', callback_data: `send_receipt_${planId}` }],
          [{ text: '🔙 بازگشت', callback_data: 'buy' }]
        ]
      }
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
  
    await this.botService.sendMessage(chatId, '🛍️ **سرویس‌های من**\n\nلیست سرویس‌های فعال شما:', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: inlineKeyboard }
    });
  }

  async handleSupport(chatId: number) {
    await this.botService.sendMessage(chatId, '💬 پشتیبانی: @support');
  }

  async handleHowToConnect(chatId: number) {
    await this.botService.sendMessage(chatId, this.botService.messageHelper.getConnectionGuide());
  }
}