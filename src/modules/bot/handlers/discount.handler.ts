import { Injectable } from '@nestjs/common';
import { PlanService } from '../../plan/services';
import { AdminMiddleware } from '../../telegram/middlewares/admin.middleware';
import { AdminStateManager } from '../states/admin.state';
import { TelegramSender } from '../utils/telegram-sender';
import { discountManagementKeyboard } from '../keyboards/admin.keyboard';

@Injectable()
export class DiscountHandler {
  constructor(
    private readonly planService: PlanService,
    private readonly adminMiddleware: AdminMiddleware,
    private readonly stateManager: AdminStateManager,
    private readonly sender: TelegramSender,
  ) {}

  async showMenu(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    await this.sender.send(bot, chatId,
      `🏷️ **مدیریت تخفیف پلن‌ها**\n\n` +
      `• فعال‌سازی تخفیف: قیمت تخفیف‌دار جدید وارد می‌شود\n` +
      `• غیرفعال‌سازی تخفیف: تخفیف پلن حذف می‌شود`,
      discountManagementKeyboard,
    );
  }

  async showPlansForEnable(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    const plans = await this.planService.findAll();
    if (!plans.length) { await this.sender.send(bot, chatId, '⚠️ هیچ پلن فعالی وجود ندارد.'); return; }
    const buttons = plans.map((p) => [{ text: `${p.has_discount ? '🎁' : '❌'} ${p.id}. ${p.name}`, callback_data: `admin_discount_enable_${p.id}` }]);
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_discount_menu' }]);
    await this.sender.send(bot, chatId, '🎁 **فعال‌سازی تخفیف**\n\nلطفاً پلن مورد نظر را انتخاب کنید:', { reply_markup: { inline_keyboard: buttons } });
  }

  async showPlansForDisable(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    const plans = await this.planService.findDiscounted();
    if (!plans.length) { await this.sender.send(bot, chatId, '⚠️ هیچ پلنی با تخفیف فعال وجود ندارد.'); return; }
    const buttons = plans.map((p) => [{ text: `🎁 ${p.id}. ${p.name}`, callback_data: `admin_discount_disable_${p.id}` }]);
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_discount_menu' }]);
    await this.sender.send(bot, chatId, '🚫 **غیرفعال‌سازی تخفیف**\n\nلطفاً پلن مورد نظر را انتخاب کنید:', { reply_markup: { inline_keyboard: buttons } });
  }

  async enableDiscount(bot: any, chatId: number, userId: number, planId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    const plan = await this.planService.findById(planId);
    if (!plan) { await this.sender.send(bot, chatId, '❌ پلن مورد نظر یافت نشد.'); return; }
    this.stateManager.set(userId, { action: 'set_discount_price', planId });
    await this.sender.send(bot, chatId,
      `🎁 **فعال‌سازی تخفیف برای پلن: ${plan.name}**\n\n` +
      `💰 قیمت اصلی: ${plan.price.toLocaleString()} تومان\n\n` +
      `لطفاً قیمت تخفیف‌دار را به تومان وارد کنید:\n🔄 برای لغو: /cancel`,
    );
  }

  async disableDiscount(bot: any, chatId: number, userId: number, planId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    try {
      const plan = await this.planService.disableDiscount(planId);
      await this.sender.send(bot, chatId,
        `✅ **تخفیف پلن "${plan.name}" با موفقیت غیرفعال شد!**\n💰 قیمت فعلی: ${plan.price.toLocaleString()} تومان`,
      );
    } catch (error) {
      await this.sender.send(bot, chatId, `❌ ${error.message}`);
    }
  }

  async disableAllDiscounts(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    await this.planService.disableAllDiscounts();
    await this.sender.send(bot, chatId, '✅ تخفیف همه پلن‌ها غیرفعال شد.');
  }

  async setDiscountPrice(bot: any, chatId: number, userId: number, text: string): Promise<void> {
    const state = this.stateManager.get(userId);
    if (!state || state.action !== 'set_discount_price') return;

    const price = parseInt(text);
    if (isNaN(price) || price <= 0) { await this.sender.send(bot, chatId, '❌ لطفاً یک عدد معتبر وارد کنید.'); return; }

    try {
      const plan = await this.planService.enableDiscount(state.planId, price);
      await this.sender.send(bot, chatId,
        `✅ **تخفیف با موفقیت فعال شد!**\n\n📦 پلن: ${plan.name}\n💰 قیمت اصلی: ${plan.price.toLocaleString()} تومان\n🎁 قیمت تخفیف‌دار: ${price.toLocaleString()} تومان`,
      );
    } catch (error) {
      await this.sender.send(bot, chatId, `❌ ${error.message}`);
    }

    this.stateManager.clear(userId);
  }
}
