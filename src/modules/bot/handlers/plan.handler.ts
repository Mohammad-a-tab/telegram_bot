import { BotService } from '../bot.service';
import { 
  adminMainKeyboard, 
  plansManagementKeyboard, 
  planListKeyboard, 
  planActionKeyboard 
} from '../keyboards/admin.keyboard';
import { Plan } from '../../plan/entities/plan.entity';
import { Config } from '../../config/entities/config.entity';
import { DataSource } from 'typeorm';

export class PlanHandler {
  constructor(private readonly botService: BotService) {}

  async showPanel(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    await this.botService.sendMessage(chatId, '🛡️ **پنل مدیریت**', { 
      parse_mode: 'Markdown', 
      ...adminMainKeyboard 
    });
  }

  async showPlansManagement(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    await this.botService.sendMessage(chatId, '📦 **مدیریت پلن‌ها**\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:', {
      parse_mode: 'Markdown',
      ...plansManagementKeyboard
    });
  }

  async showPlansList(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    const plans = await this.botService.planAdmin.getAllPlans();
    if (!plans.length) {
      await this.botService.sendMessage(chatId, '⚠️ هیچ پلنی یافت نشد.');
      return;
    }
    await this.botService.sendMessage(chatId, '📋 **لیست پلن‌ها:**', {
      parse_mode: 'Markdown',
      ...planListKeyboard(plans, 0)
    });
  }

  async showPlanDetail(chatId: number, data: string) {
    const planId = parseInt(data.split('_')[3]);
    const plan = await this.botService.planAdmin.getPlanById(planId);
    if (plan) {
      const message = this.botService.planAdmin.formatPlanMessage(plan);
      await this.botService.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...planActionKeyboard(planId)
      });
    }
  }

  async togglePlanStatus(chatId: number, userId: number, data: string) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    
    const parts = data.split('_');
    const planId = parseInt(parts[parts.length - 1]);
    
    const queryRunner = this.botService.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
  
    try {
      const plan = await queryRunner.manager.findOne(Plan, {
        where: { id: planId },
        lock: { mode: 'pessimistic_write' }
      });
      
      if (!plan) {
        await queryRunner.rollbackTransaction();
        await this.botService.sendMessage(chatId, '❌ پلن یافت نشد.');
        return;
      }
      
      plan.is_active = !plan.is_active;
      await queryRunner.manager.save(plan);
      await queryRunner.commitTransaction();
      
      await this.botService.cache.invalidatePlans();
      await this.botService.sendMessage(chatId, `✅ وضعیت پلن "${plan.name}" تغییر کرد.`);
      
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error toggling plan status:', error);
      await this.botService.sendMessage(chatId, '❌ خطا در تغییر وضعیت پلن.');
    } finally {
      await queryRunner.release();
    }
  }

  async deletePlan(chatId: number, userId: number, data: string) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    
    const parts = data.split('_');
    const planId = parseInt(parts[parts.length - 1]);
    
    if (isNaN(planId)) {
      await this.botService.sendMessage(chatId, '❌ آیدی پلن نامعتبر است.');
      return;
    }
    
    const queryRunner = this.botService.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
  
    try {
      const plan = await queryRunner.manager.findOne(Plan, {
        where: { id: planId },
        lock: { mode: 'pessimistic_write' }
      });
      
      if (!plan) {
        await queryRunner.rollbackTransaction();
        await this.botService.sendMessage(chatId, '❌ پلن یافت نشد.');
        return;
      }
  
      const configCount = await queryRunner.manager.count(Config, {
        where: { plan_id: planId }
      });
      
      if (configCount > 0) {
        await queryRunner.rollbackTransaction();
        await this.botService.sendMessage(chatId, 
          `❌ نمی‌توانید این پلن را حذف کنید.\n\n` +
          `📦 پلن: ${plan.name}\n` +
          `📊 تعداد کانفیگ‌های این پلن: ${configCount} عدد\n\n` +
          `⚠️ ابتدا تمام کانفیگ‌های این پلن را حذف کنید، سپس پلن را حذف نمایید.`
        );
        return;
      }
  
      await queryRunner.manager.delete(Plan, planId);
      await queryRunner.commitTransaction();
      
      await this.botService.cache.invalidatePlans();
      await this.botService.sendMessage(chatId, '✅ پلن با موفقیت حذف شد.');
      
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error deleting plan:', error);
      await this.botService.sendMessage(chatId, '❌ خطا در حذف پلن.');
    } finally {
      await queryRunner.release();
    }
  }

  async startAddPlan(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    this.botService.setAdminState(userId, { action: 'add_plan', step: 1, data: {} });
    await this.botService.sendMessage(chatId, 
      `➕ **افزودن پلن جدید**\n\n📝 نام پلن را وارد کنید:\n🔄 برای لغو: /cancel`,
      { parse_mode: 'Markdown' }
    );
  }

  async startEditPlan(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    const plans = await this.botService.planRepo.find({ where: { is_active: true } });
    if (!plans.length) {
      await this.botService.sendMessage(chatId, '⚠️ هیچ پلن فعالی وجود ندارد.');
      return;
    }
    const planButtons = plans.map(plan => [
      { text: `✏️ ${plan.id}. ${plan.name}`, callback_data: `admin_select_plan_for_edit_${plan.id}` }
    ]);
    await this.botService.sendMessage(chatId, '📋 **لطفاً پلن مورد نظر برای ویرایش را انتخاب کنید:**', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [...planButtons, [{ text: '🔙 بازگشت', callback_data: 'admin_plans_menu' }]] }
    });
  }

  async startEditPlanById(chatId: number, userId: number, data: string) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    const parts = data.split('_');
    const planId = parseInt(parts[parts.length - 1]);
    
    if (isNaN(planId)) {
      await this.botService.sendMessage(chatId, '❌ آیدی پلن نامعتبر است.');
      return;
    }
    
    const plan = await this.botService.planRepo.findOne({ where: { id: planId } });
    if (!plan) {
      await this.botService.sendMessage(chatId, '❌ پلن مورد نظر یافت نشد.');
      return;
    }
    
    this.botService.setAdminState(userId, { action: 'edit_plan', step: 1, planId, data: {} });
    
    await this.botService.sendMessage(chatId, 
      `✏️ **ویرایش پلن: ${plan.name}**\n\n` +
      `1️⃣ نام\n2️⃣ توضیحات\n3️⃣ قیمت (${plan.price.toLocaleString()} تومان)\n` +
      `4️⃣ مدت (${plan.duration_days} روز)\n5️⃣ حجم (${plan.bandwidth_gb} گیگابایت)\n\n` +
      `لطفاً شماره مورد نظر را وارد کنید:`,
      { parse_mode: 'Markdown' }
    );
  }

  async startDeletePlan(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    const plans = await this.botService.planRepo.find();
    if (!plans.length) {
      await this.botService.sendMessage(chatId, '⚠️ هیچ پلنی وجود ندارد.');
      return;
    }
    const planButtons = plans.map(plan => [
      { text: `🗑 ${plan.id}. ${plan.name}`, callback_data: `admin_delete_plan_${plan.id}` }
    ]);
    await this.botService.sendMessage(chatId, '⚠️ **لطفاً پلن مورد نظر برای حذف را انتخاب کنید:**', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [...planButtons, [{ text: '🔙 بازگشت', callback_data: 'admin_plans_menu' }]] }
    });
  }

  async startTogglePlan(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    const plans = await this.botService.planRepo.find();
    if (!plans.length) {
      await this.botService.sendMessage(chatId, '⚠️ هیچ پلنی وجود ندارد.');
      return;
    }
    const planButtons = plans.map(plan => [
      { text: `${plan.is_active ? '✅' : '❌'} ${plan.id}. ${plan.name}`, callback_data: `admin_toggle_plan_${plan.id}` }
    ]);
    await this.botService.sendMessage(chatId, '🔄 **لطفاً پلن مورد نظر برای تغییر وضعیت را انتخاب کنید:**', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [...planButtons, [{ text: '🔙 بازگشت', callback_data: 'admin_plans_menu' }]] }
    });
  }

  async processAddPlan(chatId: number, userId: number, text: string, state: any) {
    const step = state.step;
    const data = state.data || {};
    
    if (step === 1) {
      data.name = text;
      state.step = 2;
      await this.botService.sendMessage(chatId, '📝 توضیحات پلن را وارد کنید:');
    } else if (step === 2) {
      data.description = text;
      state.step = 3;
      await this.botService.sendMessage(chatId, '💰 قیمت پلن را به تومان وارد کنید:');
    } else if (step === 3) {
      const price = parseInt(text);
      if (isNaN(price) || price <= 0) {
        await this.botService.sendMessage(chatId, '❌ لطفاً یک عدد معتبر (بزرگتر از صفر) وارد کنید.');
        return;
      }
      data.price = price;
      state.step = 4;
      await this.botService.sendMessage(chatId, '⏱ مدت اعتبار را به روز وارد کنید:');
    } else if (step === 4) {
      const days = parseInt(text);
      if (isNaN(days) || days <= 0) {
        await this.botService.sendMessage(chatId, '❌ لطفاً یک عدد معتبر (بزرگتر از صفر) وارد کنید.');
        return;
      }
      data.duration_days = days;
      state.step = 5;
      await this.botService.sendMessage(chatId, '📊 حجم ترافیک را به گیگابایت وارد کنید (0 = نامحدود):');
    } else if (step === 5) {
      const bandwidth = parseInt(text);
      if (isNaN(bandwidth) || bandwidth < 0) {
        await this.botService.sendMessage(chatId, '❌ لطفاً یک عدد معتبر (بزرگتر یا مساوی صفر) وارد کنید.');
        return;
      }
      data.bandwidth_gb = bandwidth;
      data.is_active = true;
      data.stock = 0;
      
      try {
        const newPlan = await this.botService.planAdmin.createPlan(data);
        await this.botService.sendMessage(chatId, 
          `✅ **پلن با موفقیت ایجاد شد!**\n\n` +
          `📌 نام: ${newPlan.name}\n` +
          `💰 قیمت: ${newPlan.price.toLocaleString()} تومان\n` +
          `⏱ مدت: ${newPlan.duration_days} روز\n` +
          `📊 حجم: ${newPlan.bandwidth_gb === 0 ? 'نامحدود' : newPlan.bandwidth_gb + ' گیگ'}\n\n` +
          `🔗 برای فعال کردن این پلن، کانفیگ اضافه کنید:\n/add_config ${newPlan.id} [لینک]`);
      } catch (error) {
        await this.botService.sendMessage(chatId, `❌ خطا: ${error.message}`);
      }
      this.botService.clearAdminState(userId);
    }
    this.botService.setAdminState(userId, state);
  }

  async processEditPlan(chatId: number, userId: number, text: string, state: any) {
    try {
      const step = state.step;
      
      if (step === 1) {
        const fieldNum = parseInt(text);
        if (isNaN(fieldNum) || fieldNum < 1 || fieldNum > 5) {
          await this.botService.sendMessage(chatId, '❌ لطفاً یک شماره معتبر (1 تا 5) وارد کنید.');
          return;
        }
        const fields = ['name', 'description', 'price', 'duration_days', 'bandwidth_gb'];
        state.editField = fields[fieldNum - 1];
        state.step = 2;
        await this.botService.sendMessage(chatId, `لطفاً مقدار جدید برای ${state.editField} را وارد کنید:`);
      } else if (step === 2) {
        let value: any = text;
        
        if (['price', 'duration_days', 'bandwidth_gb'].includes(state.editField)) {
          value = parseInt(text);
          if (isNaN(value) || value < 0) {
            await this.botService.sendMessage(chatId, '❌ لطفاً یک عدد معتبر (بزرگتر یا مساوی صفر) وارد کنید.');
            return;
          }
        }
        
        const updateData = { [state.editField]: value };
        const updatedPlan = await this.botService.planAdmin.updatePlan(state.planId, updateData);
        
        if (updatedPlan) {
          await this.botService.sendMessage(chatId, `✅ فیلد ${state.editField} با موفقیت به "${value}" تغییر یافت.`);
        } else {
          await this.botService.sendMessage(chatId, '❌ خطا در ویرایش پلن.');
        }
        this.botService.clearAdminState(userId);
      }
      this.botService.setAdminState(userId, state);
    } catch (error) {
      console.error('Error in processEditPlan:', error);
      await this.botService.sendMessage(chatId, '❌ خطایی رخ داد. لطفاً دوباره تلاش کنید.');
      this.botService.clearAdminState(userId);
    }
  }

  async showPlansForConfig(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    
    const plans = await this.botService.planRepo.find({ where: { is_active: true } });
    if (!plans.length) {
      await this.botService.sendMessage(chatId, '⚠️ هیچ پلن فعالی وجود ندارد.');
      return;
    }
    
    const planButtons = plans.map(plan => [
      { text: `${plan.id}. ${plan.name}`, callback_data: `admin_select_plan_for_config_${plan.id}` }
    ]);
    
    await this.botService.sendMessage(chatId, '📦 **لطفاً پلن مورد نظر را انتخاب کنید:**', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [...planButtons, [{ text: '🔙 بازگشت', callback_data: 'admin_menu' }]] }
    });
  }
}