import { Injectable } from '@nestjs/common';
import { PlanService } from '../../plan/services';
import { AdminMiddleware } from '../../telegram/middlewares/admin.middleware';
import { AdminStateManager } from '../states/admin.state';
import { TelegramSender } from '../utils/telegram-sender';
import { adminMainKeyboard, plansManagementKeyboard, planListKeyboard, planActionKeyboard } from '../keyboards/admin.keyboard';
import { BandwidthUnit } from '../../../common/enums';

@Injectable()
export class PlanHandler {
  constructor(
    private readonly planService: PlanService,
    private readonly adminMiddleware: AdminMiddleware,
    private readonly stateManager: AdminStateManager,
    private readonly sender: TelegramSender,
  ) {}

  async showPanel(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    await this.sender.send(bot, chatId, '🛡️ **پنل مدیریت**', adminMainKeyboard);
  }

  async showPlansManagement(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    await this.sender.send(bot, chatId, '📦 **مدیریت پلن‌ها**\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:', plansManagementKeyboard);
  }

  async showPlansList(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    const plans = await this.planService.findAll();
    if (!plans.length) { await this.sender.send(bot, chatId, '⚠️ هیچ پلنی یافت نشد.'); return; }
    await this.sender.send(bot, chatId, '📋 **لیست پلن‌ها:**', planListKeyboard(plans, 0));
  }

  async showPlanDetail(bot: any, chatId: number, planId: number): Promise<void> {
    const plan = await this.planService.findById(planId);
    if (!plan) return;
    await this.sender.send(bot, chatId, this.planService.formatAdminMessage(plan), planActionKeyboard(planId));
  }

  async startAddPlan(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    this.stateManager.set(userId, { action: 'add_plan', step: 1, data: {} });
    await this.sender.send(bot, chatId,
      `➕ **افزودن پلن جدید**\n\n` +
      `📝 **مرحله 1/6:** نام پلن را وارد کنید:\n` +
      `🔄 برای لغو: /cancel`,
    );
  }

  async processAddPlan(bot: any, chatId: number, userId: number, text: string): Promise<void> {
    const state = this.stateManager.get(userId);
    if (!state || state.action !== 'add_plan') return;

    const data = state.data ?? {};

    switch (state.step) {
      case 1:
        data.name = text;
        state.step = 2;
        await this.sender.send(bot, chatId, '📝 **مرحله 2/6:** توضیحات پلن را وارد کنید:');
        break;
      case 2:
        data.description = text;
        state.step = 3;
        await this.sender.send(bot, chatId, '💰 **مرحله 3/6:** قیمت پلن را به تومان وارد کنید:');
        break;
      case 3: {
        const price = parseInt(text);
        if (isNaN(price) || price <= 0) { await this.sender.send(bot, chatId, '❌ لطفاً یک عدد معتبر (بزرگتر از صفر) وارد کنید.'); return; }
        data.price = price;
        state.step = 4;
        await this.sender.send(bot, chatId, '⏱ **مرحله 4/6:** مدت اعتبار را به روز وارد کنید:');
        break;
      }
      case 4: {
        const days = parseInt(text);
        if (isNaN(days) || days <= 0) { await this.sender.send(bot, chatId, '❌ لطفاً یک عدد معتبر (بزرگتر از صفر) وارد کنید.'); return; }
        data.duration_days = days;
        state.step = 5;
        await this.sender.send(bot, chatId,
          `📊 **مرحله 5/6:** حجم ترافیک را وارد کنید:\n\n` +
          `لطفاً مقدار عددی را وارد کنید (مثال: 50):\n` +
          `(0 = نامحدود)`,
        );
        break;
      }
      case 5: {
        const bw = parseInt(text);
        if (isNaN(bw) || bw < 0) { await this.sender.send(bot, chatId, '❌ لطفاً یک عدد معتبر (بزرگتر یا مساوی صفر) وارد کنید.'); return; }
        data.bandwidth_value = bw;
        state.step = 6;
        await this.sender.send(bot, chatId,
          `📊 **مرحله 6/6:** واحد حجم را انتخاب کنید:\n\n` +
          `• مقدار حجم وارد شده: ${bw}\n` +
          `• اگر 0 وارد کرده‌اید، نامحدود خواهد بود.\n` +
          `• واحد مورد نظر را انتخاب کنید:`,
          {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'گیگابایت (GB)', callback_data: `plan_unit_gb_${userId}` },
                { text: 'مگابایت (MB)', callback_data: `plan_unit_mb_${userId}` },
              ],
            ],
          },
        });
        break;
      }
    }

    state.data = data;
    this.stateManager.set(userId, state);
  }

  async setPlanUnit(bot: any, chatId: number, userId: number, unit: BandwidthUnit): Promise<void> {
    const state = this.stateManager.get(userId);
    if (!state || state.action !== 'add_plan') return;

    const data = state.data ?? {};
    data.bandwidth_unit = unit;

    try {
      const plan = await this.planService.create(data as any);

      let volumeDisplay = '';
      if (data.bandwidth_value === 0) {
        volumeDisplay = 'نامحدود';
      } else {
        const unitText = unit === 'GB' ? 'گیگابایت' : 'مگابایت';
        volumeDisplay = `${data.bandwidth_value?.toLocaleString()} ${unitText}`;
      }

      await this.sender.send(bot, chatId,
        `✅ **پلن با موفقیت ایجاد شد!**\n\n` +
        `📌 نام: ${plan.name}\n` +
        `📝 توضیحات: ${plan.description}\n` +
        `💰 قیمت: ${plan.price.toLocaleString()} تومان\n` +
        `⏱ مدت: ${plan.duration_days} روز\n` +
        `📊 حجم: ${volumeDisplay}\n\n` +
        `🔗 برای فعال کردن این پلن، از پنل مدیریت کانفیگ اضافه کنید.`,
      );
    } catch (error) {
      await this.sender.send(bot, chatId, `❌ خطا در ایجاد پلن: ${error.message}`);
    }

    this.stateManager.clear(userId);
  }

  async startEditPlan(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    const plans = await this.planService.findAll();
    if (!plans.length) { await this.sender.send(bot, chatId, '⚠️ هیچ پلن فعالی وجود ندارد.'); return; }
    const buttons = plans.map((p) => [{ text: `✏️ ${p.id}. ${p.name}`, callback_data: `admin_select_plan_for_edit_${p.id}` }]);
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_plans_menu' }]);
    await this.sender.send(bot, chatId, '📋 **لطفاً پلن مورد نظر برای ویرایش را انتخاب کنید:**', { reply_markup: { inline_keyboard: buttons } });
  }

  async startEditPlanById(bot: any, chatId: number, userId: number, planId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    const plan = await this.planService.findById(planId);
    if (!plan) { await this.sender.send(bot, chatId, '❌ پلن مورد نظر یافت نشد.'); return; }

    this.stateManager.set(userId, { action: 'edit_plan', step: 1, planId, data: {} });
    const unitText = plan.bandwidth_unit === 'GB' ? 'گیگابایت' : 'مگابایت';
    await this.sender.send(bot, chatId,
      `✏️ **ویرایش پلن: ${plan.name}**\n\n` +
      `1️⃣ نام (${plan.name})\n` +
      `2️⃣ توضیحات\n` +
      `3️⃣ قیمت (${plan.price.toLocaleString()} تومان)\n` +
      `4️⃣ مدت (${plan.duration_days} روز)\n` +
      `5️⃣ مقدار حجم (${plan.bandwidth_value} ${unitText})\n` +
      `6️⃣ واحد حجم (${unitText})\n\n` +
      `لطفاً شماره مورد نظر را وارد کنید:`,
    );
  }

  async processEditPlan(bot: any, chatId: number, userId: number, text: string): Promise<void> {
    const state = this.stateManager.get(userId);
    if (!state || state.action !== 'edit_plan') return;

    if (state.step === 1) {
      const num = parseInt(text);
      if (isNaN(num) || num < 1 || num > 6) { await this.sender.send(bot, chatId, '❌ لطفاً یک شماره معتبر (1 تا 6) وارد کنید.'); return; }
      const fields = ['name', 'description', 'price', 'duration_days', 'bandwidth_value', 'bandwidth_unit'];
      state.editField = fields[num - 1];

      if (state.editField === 'bandwidth_unit') {
        await this.sender.send(bot, chatId, 'لطفاً واحد حجم مورد نظر را انتخاب کنید:', {
          reply_markup: {
            inline_keyboard: [[
              { text: 'گیگابایت (GB)', callback_data: `edit_unit_gb_${state.planId}` },
              { text: 'مگابایت (MB)', callback_data: `edit_unit_mb_${state.planId}` },
            ]],
          },
        });
        this.stateManager.clear(userId);
        return;
      }

      state.step = 2;
      await this.sender.send(bot, chatId, `لطفاً مقدار جدید برای ${state.editField} را وارد کنید:`);
    } else if (state.step === 2) {
      let value: any = text;
      if (['price', 'duration_days', 'bandwidth_value'].includes(state.editField)) {
        value = parseInt(text);
        if (isNaN(value) || value < 0) { await this.sender.send(bot, chatId, '❌ لطفاً یک عدد معتبر وارد کنید.'); return; }
      }
      try {
        await this.planService.update(state.planId, { [state.editField]: value });
        await this.sender.send(bot, chatId, `✅ فیلد ${state.editField} با موفقیت به "${value}" تغییر یافت.`);
      } catch (error) {
        await this.sender.send(bot, chatId, `❌ خطا در ویرایش پلن.`);
      }
      this.stateManager.clear(userId);
      return;
    }

    this.stateManager.set(userId, state);
  }

  async editPlanUnit(bot: any, chatId: number, userId: number, unit: BandwidthUnit, planId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    try {
      await this.planService.update(planId, { bandwidth_unit: unit });
      const unitText = unit === 'GB' ? 'گیگابایت' : 'مگابایت';
      await this.sender.send(bot, chatId, `✅ واحد حجم با موفقیت به "${unitText}" تغییر یافت.`);
    } catch (error) {
      await this.sender.send(bot, chatId, `❌ خطا در ویرایش واحد حجم.`);
    }
  }

  async togglePlanStatus(bot: any, chatId: number, userId: number, planId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    try {
      const plan = await this.planService.toggleStatus(planId);
      await this.sender.send(bot, chatId, `✅ وضعیت پلن "${plan.name}" تغییر کرد.`);
    } catch (error) {
      await this.sender.send(bot, chatId, `❌ خطا در تغییر وضعیت پلن.`);
    }
  }

  async deletePlan(bot: any, chatId: number, userId: number, planId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    try {
      await this.planService.delete(planId);
      await this.sender.send(bot, chatId, '✅ پلن با موفقیت حذف شد.');
    } catch (error) {
      await this.sender.send(bot, chatId, `❌ ${error.message}`);
    }
  }

  async startDeletePlan(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    const plans = await this.planService.findAll();
    if (!plans.length) { await this.sender.send(bot, chatId, '⚠️ هیچ پلنی وجود ندارد.'); return; }
    const buttons = plans.map((p) => [{ text: `🗑 ${p.id}. ${p.name}`, callback_data: `admin_delete_plan_${p.id}` }]);
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_plans_menu' }]);
    await this.sender.send(bot, chatId, '⚠️ **لطفاً پلن مورد نظر برای حذف را انتخاب کنید:**', { reply_markup: { inline_keyboard: buttons } });
  }

  async startTogglePlan(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    const plans = await this.planService.findAll();
    if (!plans.length) { await this.sender.send(bot, chatId, '⚠️ هیچ پلنی وجود ندارد.'); return; }
    const buttons = plans.map((p) => [{ text: `${p.is_active ? '✅' : '❌'} ${p.id}. ${p.name}`, callback_data: `admin_toggle_plan_${p.id}` }]);
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_plans_menu' }]);
    await this.sender.send(bot, chatId, '🔄 **لطفاً پلن مورد نظر برای تغییر وضعیت را انتخاب کنید:**', { reply_markup: { inline_keyboard: buttons } });
  }

  async showPlansForConfig(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    const plans = await this.planService.findAll();
    if (!plans.length) { await this.sender.send(bot, chatId, '⚠️ هیچ پلن فعالی وجود ندارد.'); return; }
    const buttons = plans.map((p) => [{ text: `${p.id}. ${p.name}`, callback_data: `admin_select_plan_for_config_${p.id}` }]);
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_menu' }]);
    await this.sender.send(bot, chatId, '📦 **لطفاً پلن مورد نظر را انتخاب کنید:**', { reply_markup: { inline_keyboard: buttons } });
  }
}
