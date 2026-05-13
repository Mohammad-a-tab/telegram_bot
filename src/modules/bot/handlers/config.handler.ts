import { Injectable } from '@nestjs/common';
import { StockService } from '../../stock/services';
import { ConfigService } from '../../config/services';
import { PlanService } from '../../plan/services';
import { AdminMiddleware } from '../../telegram/middlewares/admin.middleware';
import { AdminStateManager } from '../states/admin.state';
import { TelegramSender } from '../utils/telegram-sender';
import { configsManagementKeyboard } from '../keyboards/admin.keyboard';

@Injectable()
export class ConfigHandler {
  constructor(
    private readonly stockService: StockService,
    private readonly configService: ConfigService,
    private readonly planService: PlanService,
    private readonly adminMiddleware: AdminMiddleware,
    private readonly stateManager: AdminStateManager,
    private readonly sender: TelegramSender,
  ) {}

  async showConfigsManagement(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    await this.sender.send(bot, chatId, '⚙️ مدیریت کانفیگ‌ها\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:', configsManagementKeyboard);
  }

  async list(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    const plans = await this.planService.findAll();
    if (!plans.length) { await this.sender.send(bot, chatId, '⚠️ هیچ پلن فعالی وجود ندارد.'); return; }
    const buttons = plans.map((p) => [{ text: `📦 ${p.name}`, callback_data: `admin_show_configs_${p.id}` }]);
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_configs_menu' }]);
    await this.sender.send(bot, chatId, '⚙️ **لیست کانفیگ‌ها**\n\nلطفاً پلن را انتخاب کنید:', { reply_markup: { inline_keyboard: buttons } });
  }

  async showPlanConfigs(bot: any, chatId: number, userId: number, planId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    const plan = await this.planService.findById(planId);
    if (!plan) return;

    const total = await this.configService.countByPlan(planId);

    await this.sender.send(
      bot,
      chatId,
      `⚙️ <b>کانفیگ‌های پلن: ${plan.name}</b>\n📊 موجودی: ${plan.stock}\n📋 کل: ${total}\n\nنمایش:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ موجود', callback_data: `admin_configs_filter_available_${planId}` },
              { text: '❌ فروخته شده', callback_data: `admin_configs_filter_sold_${planId}` },
              { text: '📋 همه', callback_data: `admin_configs_filter_all_${planId}` },
            ],
            [{ text: '🔙 بازگشت', callback_data: 'admin_list_configs' }],
          ],
        },
      },
    );
  }

  async showPlanConfigsFiltered(
    bot: any,
    chatId: number,
    userId: number,
    planId: number,
    filter: 'all' | 'available' | 'sold',
  ): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    const plan = await this.planService.findById(planId);
    if (!plan) return;

    const configs =
      filter === 'all'
        ? await this.configService.findByPlan(planId)
        : await this.configService.findByPlanAndStatus(planId, filter === 'sold');

    if (!configs.length) {
      await this.sender.send(bot, chatId, `⚠️ کانفیگی در این دسته‌بندی یافت نشد.`);
      return;
    }

    const label = filter === 'all' ? 'همه' : filter === 'available' ? 'موجود' : 'فروخته شده';
    await this.sender.send(
      bot, chatId,
      `⚙️ <b>${plan.name} — ${label} (${configs.length})</b>`,
      { parse_mode: 'HTML' },
    );

    for (const config of configs) {
      const status = config.is_sold_out ? '❌ فروخته شده' : '✅ موجود';
      let text = `🆔 #${config.id} ${status}\n🔗 <code>${config.config_link}</code>`;
      if (config.is_sold_out) {
        const buyer = await this.configService.getBuyerForConfig(config.id);
        if (buyer) text += `\n👤 خریدار: ${buyer}`;
      }
      await this.sender.send(bot, chatId, text, { parse_mode: 'HTML' });
    }
  }

  async startAdd(bot: any, chatId: number, userId: number, planId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    this.stateManager.set(userId, { action: 'add_configs', step: 1, planId });
    await this.sender.send(bot, chatId, '🔗 لطفاً لینک کانفیگ را وارد کنید (می‌توانید چندین لینک با کاما یا خط جدید وارد کنید):');
  }

  async processAddConfigs(bot: any, chatId: number, userId: number, text: string): Promise<void> {
    const state = this.stateManager.get(userId);
    if (!state || state.action !== 'add_configs') return;

    await this.sender.send(bot, chatId, '🔄 در حال پردازش...');
    try {
      const result = await this.stockService.addConfigs({ planId: state.planId, input: text });
      await this.sender.send(bot, chatId, `✅ ${result.added} کانفیگ اضافه شد.`);
    } catch (error) {
      await this.sender.send(bot, chatId, `❌ خطا: ${error.message}`);
    }
    this.stateManager.clear(userId);
  }

  async startDelete(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    this.stateManager.set(userId, { action: 'delete_config', step: 1 });
    await this.sender.send(bot, chatId, '🗑 لطفاً آیدی کانفیگ مورد نظر را وارد کنید:');
  }

  async deleteConfig(bot: any, chatId: number, userId: number, configId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    try {
      await this.stockService.deleteConfig(configId);
      await this.sender.send(bot, chatId, '✅ کانفیگ با موفقیت حذف شد.');
    } catch (error) {
      await this.sender.send(bot, chatId, `❌ ${error.message}`);
    }
  }
}
