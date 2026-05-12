import { BotService } from '../bot.service';
import { configsManagementKeyboard } from '../keyboards/admin.keyboard';

export class ConfigHandler {
  constructor(private readonly botService: BotService) {}

  async handleAddConfig(chatId: number, userId: number, text: string) {
    const isAdmin = await this.botService.adminMiddleware.isAdmin(userId);
    if (!isAdmin) {
      await this.botService.sendMessage(chatId, '❌ شما دسترسی به این بخش ندارید.');
      return;
    }

    const parts = text.split(' ');
    if (parts.length < 3) {
      await this.botService.sendMessage(chatId, '❌ فرمت صحیح: /add_config [planId] [configLink]');
      return;
    }

    const planId = parseInt(parts[1]);
    const configLink = parts[2];
    const plan = await this.botService.planRepo.findOne({ where: { id: planId } });
    if (!plan) {
      await this.botService.sendMessage(chatId, '❌ پلن مورد نظر یافت نشد.');
      return;
    }

    await this.botService.sendMessage(chatId, '🔄 در حال پردازش...');

    try {
      await this.botService.stock.addConfigs(planId, configLink);
      const remainingStock = await this.botService.stock.getRemainingStock(planId);
      await this.botService.sendMessage(chatId,
        `✅ **کانفیگ اضافه شد!**\n📦 پلن: ${plan.name}\n📊 موجودی: ${remainingStock}\n🔗 لینک: \`${configLink}\``,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      await this.botService.sendMessage(chatId, `❌ خطا: ${error.message}`);
    }
  }

  async list(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    const plans = await this.botService.planRepo.find({ where: { is_active: true } });
    if (!plans.length) {
      await this.botService.sendMessage(chatId, '⚠️ هیچ پلن فعالی وجود ندارد.');
      return;
    }
    const planButtons = plans.map(plan => [{ text: `📦 ${plan.name}`, callback_data: `admin_show_configs_${plan.id}` }]);
    await this.botService.sendMessage(chatId, '⚙️ **لیست کانفیگ‌ها**\n\nلطفاً پلن را انتخاب کنید:', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [...planButtons, [{ text: '🔙 بازگشت', callback_data: 'admin_configs_menu' }]] }
    });
  }

  async showPlanConfigs(chatId: number, userId: number, planId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    const plan = await this.botService.planRepo.findOne({ where: { id: planId } });
    if (!plan) return;
    
    const configs = await this.botService.configRepo.find({ where: { plan_id: planId } });
    if (!configs.length) {
      await this.botService.sendMessage(chatId, `⚠️ هیچ کانفیگی برای پلن "${plan.name}" یافت نشد.`);
      return;
    }
    
    let message = `⚙️ **کانفیگ‌های پلن: ${plan.name}**\n📊 موجودی: ${plan.stock}\n📋 تعداد: ${configs.length}\n\n`;
    for (const config of configs) {
      message += `🆔 #${config.id} ${config.is_sold_out ? '❌ فروخته شده' : '✅ موجود'}\n🔗 \`${config.config_link}\`\n`;
      if (config.is_sold_out) {
        const order = await this.botService.orderRepo.findOne({ where: { config_id: config.id, status: 1 }, relations: ['user'] });
        if (order?.user) message += `👤 خریدار: ${order.user.username ? `@${order.user.username}` : order.user.first_name}\n`;
      }
      message += `\n`;
    }
    await this.botService.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }

  async startAdd(chatId: number, userId: number, data: string) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    const planId = parseInt(data.split('_')[5]);
    this.botService.setAdminState(userId, { action: 'add_configs', step: 1, planId });
    await this.botService.sendMessage(chatId, `🔗 لطفاً لینک کانفیگ را وارد کنید (می‌توانید چندین لینک با کاما یا خط جدید وارد کنید):`);
  }

  async startDelete(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    this.botService.setAdminState(userId, { action: 'delete_config', step: 1 });
    await this.botService.sendMessage(chatId, '🗑 لطفاً آیدی کانفیگ مورد نظر را وارد کنید:');
  }

  async processAddConfigs(chatId: number, userId: number, text: string, state: any) {
    await this.botService.sendMessage(chatId, '🔄 در حال پردازش...');
    try {
      const result = await this.botService.stock.addConfigs(state.planId, text);
      await this.botService.sendMessage(chatId, `✅ ${result.added} کانفیگ اضافه شد.`);
    } catch (error) {
      await this.botService.sendMessage(chatId, `❌ خطا: ${error.message}`);
    }
    this.botService.clearAdminState(userId);
  }

  async showConfigsManagement(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    
    await this.botService.sendMessage(chatId, '⚙️ مدیریت کانفیگ‌ها\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:', {
      parse_mode: 'Markdown',
      ...configsManagementKeyboard
    });
  }

  async deleteConfig(chatId: number, userId: number, configId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    
    const config = await this.botService.configRepo.findOne({ 
      where: { id: configId },
      relations: ['plan']
    });
    
    if (!config) {
      await this.botService.sendMessage(chatId, '❌ کانفیگ یافت نشد.');
      return;
    }
    
    const plan = config.plan;
    const wasSold = config.is_sold_out;
    await this.botService.configRepo.delete(config.id);
    
    if (plan && !wasSold) {
      plan.stock = Math.max(0, (plan.stock || 0) - 1);
      await this.botService.planRepo.save(plan);
      console.log(`📊 Plan ${plan.id} stock decreased to: ${plan.stock} (config deleted)`);
    }

    await this.botService.cache.invalidatePlans();
    await this.botService.cache.del(`available_config_${plan.id}`);
    await this.botService.cache.del(`can_purchase_${plan.id}`);
    await this.botService.cache.del(`remaining_stock_${plan.id}`);
    
    await this.botService.sendMessage(chatId, '✅ کانفیگ با موفقیت حذف شد.');
  }
}