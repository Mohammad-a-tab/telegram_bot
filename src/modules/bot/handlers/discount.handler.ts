import { BotService } from '../bot.service';
import { discountManagementKeyboard } from '../keyboards/admin.keyboard';

export class DiscountHandler {
  constructor(private readonly botService: BotService) {}

  async showMenu(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    
    await this.botService.sendMessage(chatId, 
      `🏷️ **مدیریت تخفیف پلن‌ها**\n\n` +
      `• فعال‌سازی تخفیف: قیمت تخفیف‌دار جدید وارد می‌شود\n` +
      `• غیرفعال‌سازی تخفیف: تخفیف پلن حذف می‌شود`,
      { parse_mode: 'Markdown', ...discountManagementKeyboard }
    );
  }

  async showPlansForEnable(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    
    const plans = await this.botService.planRepo.find({ where: { is_active: true } });
    if (!plans.length) {
      await this.botService.sendMessage(chatId, '⚠️ هیچ پلن فعالی وجود ندارد.');
      return;
    }
    
    const planButtons = plans.map(plan => [
      { text: `${plan.has_discount ? '🎁' : '❌'} ${plan.id}. ${plan.name}`, callback_data: `admin_discount_enable_${plan.id}` }
    ]);
    
    await this.botService.sendMessage(chatId, '🎁 **فعال‌سازی تخفیف**\n\nلطفاً پلن مورد نظر را انتخاب کنید:', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [...planButtons, [{ text: '🔙 بازگشت', callback_data: 'admin_discount_menu' }]] }
    });
  }

  async showPlansForDisable(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    
    const plans = await this.botService.planRepo.find({ where: { has_discount: true, is_active: true } });
    if (!plans.length) {
      await this.botService.sendMessage(chatId, '⚠️ هیچ پلنی با تخفیف فعال وجود ندارد.');
      return;
    }
    
    const planButtons = plans.map(plan => [
      { text: `🎁 ${plan.id}. ${plan.name}`, callback_data: `admin_discount_disable_${plan.id}` }
    ]);
    
    await this.botService.sendMessage(chatId, '🚫 **غیرفعال‌سازی تخفیف**\n\nلطفاً پلن مورد نظر را انتخاب کنید:', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [...planButtons, [{ text: '🔙 بازگشت', callback_data: 'admin_discount_menu' }]] }
    });
  }

  async disableAllDiscounts(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    
    await this.botService.planRepo.update(
      { has_discount: true },
      { has_discount: false, discounted_price: null }
    );
    await this.botService.cache.invalidatePlans();
    
    await this.botService.sendMessage(chatId, '✅ تخفیف همه پلن‌ها غیرفعال شد.');
  }

  async enable(chatId: number, userId: number, planId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    
    const plan = await this.botService.planRepo.findOne({ where: { id: planId } });
    if (!plan) {
      await this.botService.sendMessage(chatId, '❌ پلن مورد نظر یافت نشد.');
      return;
    }
    
    this.botService.setAdminState(userId, { action: 'set_discount_price', planId: planId });
    
    await this.botService.sendMessage(chatId,
      `🎁 **فعال‌سازی تخفیف برای پلن: ${plan.name}**\n\n` +
      `💰 قیمت اصلی: ${plan.price.toLocaleString()} تومان\n\n` +
      `لطفاً قیمت تخفیف‌دار را به تومان وارد کنید:\n🔄 برای لغو: /cancel`,
      { parse_mode: 'Markdown' }
    );
  }

  async disable(chatId: number, userId: number, planId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    
    const plan = await this.botService.planRepo.findOne({ where: { id: planId } });
    if (!plan) {
      await this.botService.sendMessage(chatId, '❌ پلن مورد نظر یافت نشد.');
      return;
    }
    
    plan.has_discount = false;
    plan.discounted_price = null;
    await this.botService.planRepo.save(plan);
    await this.botService.cache.invalidatePlans();
    
    await this.botService.sendMessage(chatId,
      `✅ **تخفیف پلن "${plan.name}" با موفقیت غیرفعال شد!**\n💰 قیمت فعلی: ${plan.price.toLocaleString()} تومان`,
      { parse_mode: 'Markdown' }
    );
  }

  async setDiscountPrice(chatId: number, userId: number, priceText: string) {
    const state = this.botService.getAdminState(userId);
    if (!state || state.action !== 'set_discount_price') return;
    
    const price = parseInt(priceText);
    if (isNaN(price) || price <= 0) {
      await this.botService.sendMessage(chatId, '❌ لطفاً یک عدد معتبر وارد کنید.');
      return;
    }
    
    const plan = await this.botService.planRepo.findOne({ where: { id: state.planId } });
    if (!plan) {
      await this.botService.sendMessage(chatId, '❌ پلن مورد نظر یافت نشد.');
      this.botService.clearAdminState(userId);
      return;
    }
    
    plan.has_discount = true;
    plan.discounted_price = price;
    await this.botService.planRepo.save(plan);
    await this.botService.cache.invalidatePlans();
    
    await this.botService.sendMessage(chatId,
      `✅ **تخفیف با موفقیت فعال شد!**\n\n📦 پلن: ${plan.name}\n💰 قیمت اصلی: ${plan.price.toLocaleString()} تومان\n🎁 قیمت تخفیف‌دار: ${price.toLocaleString()} تومان`,
      { parse_mode: 'Markdown' }
    );
    
    this.botService.clearAdminState(userId);
  }
}