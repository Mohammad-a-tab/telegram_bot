import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { Plan } from '../plan/entities/plan.entity';
import { Order } from '../order/entities/order.entity';
import { Config } from '../config/entities/config.entity';
import { CacheService } from '../cache/cache.service';
import { ChannelMiddleware } from '../telegram/middlewares/channel.middleware';
import { AdminMiddleware } from '../telegram/middlewares/admin.middleware';
import { PlanAdminService } from '../plan/plan.admin.service';
import { StockService } from '../stock/stock.service';
import { SubService } from '../sub/sub.service';
import { StockCheckerService } from '../stock/stock.checker.service';
import { MessageHelper } from './utils/message.utils';
import { adminStates } from './states/admin.state';
import { CallbackHandler } from './handlers/callback.handler';
import { OrderHandler } from './handlers/order.handler';
import { getMainKeyboard, getPlanKeyboard } from './keyboards/main.keyboard';
import { 
  adminMainKeyboard,
  plansManagementKeyboard,
  subsManagementKeyboard,
  configsManagementKeyboard,
  ordersManagementKeyboard,
} from './keyboards/admin.keyboard';

const TelegramBot = require('node-telegram-bot-api');

@Injectable()
export class BotService {
  private bot: any;
  private messageHelper: MessageHelper;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Plan) private planRepo: Repository<Plan>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Config) private configRepo: Repository<Config>,
    private dataSource: DataSource,
    private cache: CacheService,
    private channelMiddleware: ChannelMiddleware,
    private adminMiddleware: AdminMiddleware,
    private planAdmin: PlanAdminService,
    private stock: StockService,
    private sub: SubService,
    private stockChecker: StockCheckerService,
  ) {
    this.messageHelper = new MessageHelper();
  }

  private isPolling = false;

async init(token: string) {
  if (this.bot) {
    try {
      await this.bot.stopPolling();
      this.bot.removeAllListeners();
    } catch (e) {
      console.log('Stopping existing bot...');
    }
  }
  
  this.bot = new TelegramBot(token, { 
    polling: false  // polling رو دستی شروع می‌کنیم
  });
  
  this.setupHandlers();
  
  // شروع polling با مدیریت خطا
  await this.startPollingSafely();
  
  const adminGroupId = process.env.ADMIN_GROUP_ID;
  if (adminGroupId) {
    await this.stockChecker.startChecking(this.bot, adminGroupId);
  }
  
  console.log('✅ Telegram bot started with polling!');
  return this.bot;
}

private async startPollingSafely() {
  if (this.isPolling) {
    console.log('⚠️ Polling already active, skipping...');
    return;
  }
  
  try {
    await this.bot.startPolling();
    this.isPolling = true;
    
    // هندلر خطای polling بدون ساخت instance جدید
    this.bot.on('polling_error', async (error) => {
      console.error('⚠️ Polling error:', error.message);
      
      // اگر خطای 409 بود، یعنی instance دیگه‌ای وجود داره
      if (error.message.includes('409') || error.message.includes('Conflict')) {
        console.log('🔄 Conflict detected, waiting for other instance...');
        return; // هیچ کاری نکن، instance دیگه کار می‌کنه
      }
      
      // فقط برای خطاهای دیگه reconnect کن
      if (!this.isPolling) return;
      
      this.isPolling = false;
      console.log('🔄 Trying to reconnect in 10 seconds...');
      
      setTimeout(() => {
        this.startPollingSafely().catch(console.error);
      }, 10000);
    });
    
  } catch (error) {
    console.error('❌ Failed to start polling:', error.message);
    this.isPolling = false;
    throw error;
  }
}

  private setupHandlers() {
    this.bot.onText(/\/start/, (m) => this.handleStart(m));
    this.bot.onText(/🛒 خرید VPN/, (m) => this.showPlans(m.chat.id, m.from.id));
    this.bot.onText(/🛍️ سرویس‌های من/, (m) => this.showUserServices(m.chat.id, m.from.id));
    this.bot.onText(/💬 پشتیبانی/, (m) => this.sendMessage(m.chat.id, '💬 پشتیبانی: @support'));
    this.bot.onText(/🔧 نحوه اتصال/, (m) => this.sendMessage(m.chat.id, this.messageHelper.getConnectionGuide()));
    this.bot.onText(/🛠 پنل مدیریت/, (m) => this.showAdminPanel(m.chat.id, m.from.id));
    this.bot.onText(/\/add_config\s+(\d+)\s+(.+)/, (m, match) => this.addConfig(m, match));
    this.bot.onText(/\/add_sub (.+)/, (m, match) => this.addSub(m, match));
    this.bot.onText(/\/list_subs/, (m) => this.showSubsList(m.chat.id, m.from.id));
    this.bot.onText(/\/check_stock/, (m) => this.stockChecker.checkAndNotify(this.bot, m.chat.id.toString()));
    this.bot.on('callback_query', (q) => new CallbackHandler(this).handle(q));
    this.bot.on('photo', (m) => new OrderHandler(this).handleReceipt(m));
    this.bot.on('message', (m) => this.handleTextMessage(m));
    this.bot.on('disconnect', () => {
      console.log('⚠️ Bot disconnected, attempting to reconnect...');
      this.handleReconnect();
    });
  }

  private async handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnect attempts reached');
      process.exit(1);
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(5000 * this.reconnectAttempts, 30000);
    
    console.log(`🔄 Reconnecting in ${delay / 1000} seconds... (Attempt ${this.reconnectAttempts})`);
    
    setTimeout(async () => {
      try {
        await this.bot.startPolling();
        this.reconnectAttempts = 0;
        console.log('✅ Bot reconnected successfully');
      } catch (error) {
        console.error('❌ Reconnect failed:', error.message);
        this.handleReconnect();
      }
    }, delay);
  }

  async handleStart(msg: any) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.chat.first_name || 'کاربر';
    
    const isMember = await this.ensureMembership(userId, chatId);
    if (!isMember) return;
  
    const isAdmin = await this.adminMiddleware.isAdmin(userId);
    const keyboard = getMainKeyboard(isAdmin);
    
    const message = 
      `👋 سلام ${firstName}!\n\n` +
      `🎉 به ربات ما خوش آمدید!\n\n` +
      `🔐 شما میتوانید از ما VPN با قیمت مناسب و کیفیت بالا تهیه کنید.\n\n` +
      `✨ ویژگی‌های ما:\n` +
      `• قیمت مقرون به صرفه\n` +
      `• پایداری و قابل اعتماد\n` +
      `• پلن‌های متنوع\n` +
      `• پشتیبانی سریع و حرفه‌ای`;
    
    await this.bot.sendMessage(chatId, message, keyboard);
  }

  async showPlans(chatId: number, userId: number) {
    if (!await this.ensureMembership(userId, chatId)) return;
    await this.upsertUser(userId);
  
    let plans = await this.cache.getPlans();
    if (!plans) {
      plans = await this.planRepo.find({ where: { is_active: true }, order: { price: 'ASC' } });
      await this.cache.setPlans(plans);
    }
  
    if (!plans.length) {
      await this.bot.sendMessage(chatId, '⚠️ هیچ پلن فعالی وجود ندارد.');
      return;
    }
  
    const keyboard = getPlanKeyboard(plans);
    await this.bot.sendMessage(chatId, '🎯 لطفاً یکی از پلن‌های زیر را انتخاب کنید:', keyboard);
  }

  async showUserOrders(chatId: number, userId: number) {
    if (!await this.ensureMembership(userId, chatId)) return;

    const orders = await this.orderRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' }
    });

    if (!orders.length) {
      await this.sendMessage(chatId, '📦 شما هنوز سرویسی خریداری نکرده‌اید.');
      return;
    }

    let message = '📋 سرویس‌های شما:\n\n';
    for (const order of orders) {
      const plan = await this.planRepo.findOne({ where: { id: order.plan_id } });
      const statusText = order.status === 1 ? '✅ فعال' : order.status === 0 ? '⏳ در انتظار تایید' : '❌ منقضی';
      message += `🆔 سفارش #${order.id}\n📦 پلن: ${plan?.name}\n📊 وضعیت: ${statusText}\n📅 تاریخ: ${new Date(order.created_at).toLocaleDateString('fa-IR')}\n\n`;
    }
    await this.sendMessage(chatId, message);
  }

  async showAdminPanel(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) {
      await this.sendMessage(chatId, '❌ شما دسترسی به این بخش ندارید.');
      return;
    }
    
    const message = `🛡️ **خوش آمدید به پنل مدیریت** 👑\n\n` +
      `✨ **یکی از گزینه‌های زیر را انتخاب کنید:**\n\n` +
      `📦 مدیریت پلن‌ها\n` +
      `🔗 مدیریت ساب لینک\n` +
      `⚙️ مدیریت کانفیگ‌ها\n` +
      `📋 مدیریت سفارشات`;
    
    await this.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      ...adminMainKeyboard
    });
  }

  async showSubsList(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    const subLink = await this.sub.getSub();
    if (!subLink) {
      await this.sendMessage(chatId, '⚠️ هیچ ساب لینکی در سیستم وجود ندارد.');
      return;
    }
    
    await this.sendMessage(chatId, `📋 **ساب لینک فعلی:**\n\n\`${subLink}\``, { parse_mode: 'Markdown' });
  }

  async showPlansManagement(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    await this.sendMessage(chatId, '📦 **مدیریت پلن‌ها**\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:', {
      parse_mode: 'Markdown',
      ...plansManagementKeyboard
    });
  }
  
  async showSubsManagement(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    const hasSub = await this.sub.hasSub();
    const status = hasSub ? '✅ تنظیم شده' : '❌ تنظیم نشده';
    
    await this.sendMessage(chatId, `🔗 **مدیریت ساب لینک**\n\n📋 وضعیت فعلی: ${status}\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:`, {
      parse_mode: 'Markdown',
      ...subsManagementKeyboard
    });
  }
  
  async showConfigsManagement(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    await this.sendMessage(chatId, '⚙️ **مدیریت کانفیگ‌ها**\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:', {
      parse_mode: 'Markdown',
      ...configsManagementKeyboard
    });
  }
  
  async startEditPlanById(chatId: number, userId: number, data: string) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    const planId = parseInt(data.split('_')[5]);
    adminStates.set(userId, { action: 'edit_plan', step: 1, planId, data: {} });
    
    await this.sendMessage(chatId, 
      `✏️ **ویرایش پلن #${planId}**\n\n` +
      `چه اطلاعاتی را می‌خواهید ویرایش کنید؟\n\n` +
      `1️⃣ نام\n2️⃣ توضیحات\n3️⃣ قیمت\n4️⃣ قیمت با تخفیف\n5️⃣ مدت (روز)\n6️⃣ حجم (گیگابایت)\n7️⃣ موجودی\n\n` +
      `لطفاً شماره مورد نظر را وارد کنید:`,
      { parse_mode: 'Markdown' }
    );
  }
  
  async showUserServices(chatId: number, userId: number) {
    if (!await this.ensureMembership(userId, chatId)) return;
  
    const orders = await this.orderRepo.find({
      where: { user_id: userId, status: 1 },
      order: { created_at: 'DESC' }
    });
  
    if (!orders.length) {
      await this.sendMessage(chatId, 
        `📦 **سرویس‌های من**\n\n` +
        `شما هنوز هیچ سرویسی خریداری نکرده‌اید.\n\n` +
        `🛍️ برای خرید، روی دکمه "خرید VPN" کلیک کنید.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🛍️ خرید VPN', callback_data: 'buy' }],
              [{ text: '🔙 بازگشت به صفحه اصلی', callback_data: 'main_menu' }]
            ]
          }
        }
      );
      return;
    }
  
    const services = [];
    for (const order of orders) {
      const plan = await this.planRepo.findOne({ where: { id: order.plan_id } });
      if (plan) {
        services.push({ id: order.id, name: plan.name });
      }
    }
  
    // ساخت inline_keyboard به صورت صحیح
    const inlineKeyboard = [];
    
    for (const service of services) {
      inlineKeyboard.push([{ text: `🛍️ ${service.name}`, callback_data: `service_detail_${service.id}` }]);
    }
    
    inlineKeyboard.push([{ text: '🔙 بازگشت به صفحه اصلی', callback_data: 'main_menu' }]);
  
    await this.sendMessage(chatId, 
      `🛍️ **سرویس‌های من**\n\n` +
      `سلام! 👋\n` +
      `در زیر لیست سرویس‌های فعال شما قرار دارد.\n` +
      `برای مشاهده جزئیات هر سرویس، روی آن کلیک کنید.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      }
    );
  }
  
  async showServiceDetail(chatId: number, userId: number, serviceId: number) {
    if (!await this.ensureMembership(userId, chatId)) return;
  
    const order = await this.orderRepo.findOne({ where: { id: serviceId, user_id: userId } });
  
    if (!order || order.status !== 1) {
      await this.sendMessage(chatId, '❌ سرویس مورد نظر یافت نشد یا فعال نیست.');
      return;
    }
  
    const plan = await this.planRepo.findOne({ where: { id: order.plan_id } });
    const config = await this.configRepo.findOne({ where: { id: order.config_id } });
  
    const expiryDate = order.expires_at ? new Date(order.expires_at) : new Date(order.approved_at || order.created_at);
    expiryDate.setDate(expiryDate.getDate() + (plan?.duration_days || 30));
    
    const volumeIcon = plan?.bandwidth_gb === 0 ? '♾️' : '📊';
    const volumeText = plan?.bandwidth_gb === 0 ? 'نامحدود' : `${plan?.bandwidth_gb} گیگابایت`;
    
    const message = 
      `🌟 **جزئیات سرویس** 🌟\n\n` +
      `📛 **نام اشتراک:** ${plan?.name}\n` +
      `${volumeIcon} **حجم اشتراک:** ${volumeText}\n` +
      `👥 **محدودیت کاربر:** ♾️\n` +
      `🔗 برای دریافت لینک اشتراک روی دکمه زیر کلیک کنید.`;
  
    const configLink = config?.config_link || '';
  
    await this.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔗 دریافت لینک اشتراک', callback_data: `copy_config_${configLink}` }],
          [{ text: '🔙 بازگشت به لیست سرویس‌ها', callback_data: 'back_to_services' }]
        ]
      }
    });
  }


async copyConfigLink(chatId: number, userId: number, configLink: string) {
  const subLink = await this.sub.getSub();
  await this.sendMessage(chatId, 
    `🔗 **لینک اشتراک شما**\n\n` +
    `\`${subLink}${configLink}\`\n\n` +
    `📌 برای کپی کردن، روی لینک بالا کلیک کنید.`,
    { parse_mode: 'Markdown' }
  );
}


  async startEditPlan(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    const plans = await this.planRepo.find({ where: { is_active: true } });
    if (!plans.length) {
      await this.sendMessage(chatId, '⚠️ هیچ پلن فعالی وجود ندارد.');
      return;
    }
    
    const planButtons = plans.map(plan => [
      { text: `✏️ ${plan.id}. ${plan.name}`, callback_data: `admin_select_plan_for_edit_${plan.id}` }
    ]);
    
    await this.sendMessage(chatId, '📋 **لطفاً پلن مورد نظر برای ویرایش را انتخاب کنید:**', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [...planButtons, [{ text: '🔙 بازگشت', callback_data: 'admin_plans_menu' }]] }
    });
  }
  async startDeletePlan(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    const plans = await this.planRepo.find();
    if (!plans.length) {
      await this.sendMessage(chatId, '⚠️ هیچ پلنی وجود ندارد.');
      return;
    }
    
    const planButtons = plans.map(plan => [
      { text: `🗑 ${plan.id}. ${plan.name}`, callback_data: `admin_select_plan_for_delete_${plan.id}` }
    ]);
    
    await this.sendMessage(chatId, '⚠️ **لطفاً پلن مورد نظر برای حذف را انتخاب کنید:**', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [...planButtons, [{ text: '🔙 بازگشت', callback_data: 'admin_plans_menu' }]] }
    });
  }
  
  async startTogglePlan(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    const plans = await this.planRepo.find();
    if (!plans.length) {
      await this.sendMessage(chatId, '⚠️ هیچ پلنی وجود ندارد.');
      return;
    }
    
    const planButtons = plans.map(plan => [
      { text: `${plan.is_active ? '✅' : '❌'} ${plan.id}. ${plan.name}`, callback_data: `admin_select_plan_for_toggle_${plan.id}` }
    ]);
    
    await this.sendMessage(chatId, '🔄 **لطفاً پلن مورد نظر برای تغییر وضعیت را انتخاب کنید:**', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [...planButtons, [{ text: '🔙 بازگشت', callback_data: 'admin_plans_menu' }]] }
    });
  }
  
  async listConfigs(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    const plans = await this.planRepo.find({
      where: { is_active: true },
      order: { id: 'ASC' }
    });
    
    if (plans.length === 0) {
      await this.sendMessage(chatId, '⚠️ هیچ پلن فعالی وجود ندارد.');
      return;
    }
    
    const planButtons = plans.map(plan => [
      { text: `📦 ${plan.name} (موجودی: ${plan.stock || 0})`, callback_data: `admin_show_configs_${plan.id}` }
    ]);
    
    await this.sendMessage(chatId, 
      `⚙️ **لیست کانفیگ‌ها**\n\n` +
      `لطفاً ابتدا پلن مورد نظر را انتخاب کنید:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [...planButtons, [{ text: '🔙 بازگشت', callback_data: 'admin_configs_menu' }]]
        }
      }
    );
  }
  
  async showPlanConfigs(chatId: number, userId: number, planId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) {
      await this.sendMessage(chatId, '❌ پلن مورد نظر یافت نشد.');
      return;
    }
    
    const configs = await this.configRepo.find({
      where: { plan_id: planId },
      order: { id: 'ASC' }
    });
    
    if (configs.length === 0) {
      await this.sendMessage(chatId, 
        `⚠️ هیچ کانفیگی برای پلن "${plan.name}" یافت نشد.\n\n` +
        `برای افزودن کانفیگ: /add_config ${planId} [لینک]`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    let message = `⚙️ **کانفیگ‌های پلن: ${plan.name}**\n\n`;
    message += `📊 موجودی پلن: ${plan.stock || 0}\n`;
    message += `📋 تعداد کل کانفیگ‌ها: ${configs.length}\n\n`;
    message += `┌─────────────────────────────┐\n`;
    
    for (const config of configs) {
      const statusIcon = config.is_sold_out ? '❌' : '✅';
      const statusText = config.is_sold_out ? 'فروخته شده' : 'موجود';
      
      message += `│ 🆔 **#${config.id}** ${statusIcon} ${statusText}\n`;
      message += `│ 🔗 لینک: \`${config.config_link}\`\n`;
      
      if (config.is_sold_out) {
        const order = await this.orderRepo.findOne({
          where: { config_id: config.id, status: 1 },
          relations: ['user']
        });
        
        if (order?.user) {
          const user = order.user;
          const userLink = user.username 
            ? `@${user.username}` 
            : `[${user.first_name || 'کاربر'}](tg://user?id=${user.id})`;
          message += `│ 👤 خریدار: ${userLink}\n`;
        }
      }
      
      message += `│\n`;
    }
    
    message += `└─────────────────────────────┘\n\n`;
    message += `📌 برای کپی کردن لینک، روی آن کلیک کنید.\n`;
    message += `🔗 برای افزودن کانفیگ جدید: /add_config ${planId} [لینک]`;
    
    await this.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ افزودن کانفیگ جدید', callback_data: `admin_add_config_to_plan_${planId}` }],
          [{ text: '🔙 بازگشت به لیست پلن‌ها', callback_data: 'admin_list_configs' }]
        ]
      }
    });
  }
  
  async startDeleteConfig(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    adminStates.set(userId, { action: 'delete_config', step: 1 });
    await this.sendMessage(chatId, '🗑 **حذف کانفیگ**\n\nلطفاً آیدی کانفیگ مورد نظر را وارد کنید:\n\n🔄 برای لغو: /cancel', { parse_mode: 'Markdown' });
  }
  
  async listAllOrders(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    await this.listOrdersByStatus(chatId, null);
  }
  
  async listPendingOrders(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    await this.listOrdersByStatus(chatId, 0);
  }
  
  async listApprovedOrders(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    await this.listOrdersByStatus(chatId, 1);
  }
  
  async listRejectedOrders(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    await this.listOrdersByStatus(chatId, 2);
  }
  
  private async listOrdersByStatus(chatId: number, status: number | null) {
    const where: any = {};
    if (status !== null) where.status = status;
    
    const orders = await this.orderRepo.find({
      where,
      order: { created_at: 'DESC' },
      take: 20
    });
    
    if (!orders.length) {
      const statusText = status === 0 ? 'در انتظار' : status === 1 ? 'تایید شده' : status === 2 ? 'رد شده' : '';
      await this.sendMessage(chatId, `⚠️ هیچ سفارش ${statusText}ی وجود ندارد.`);
      return;
    }
    
    let message = '📋 **لیست سفارشات**\n\n';
    for (const order of orders) {
      const plan = await this.planRepo.findOne({ where: { id: order.plan_id } });
      const statusText = order.status === 0 ? '⏳ در انتظار' : order.status === 1 ? '✅ تایید شده' : '❌ رد شده';
      message += `🆔 سفارش #${order.id}\n👤 کاربر: ${order.user_id}\n📦 پلن: ${plan?.name}\n💰 مبلغ: ${order.amount.toLocaleString()} تومان\n📊 وضعیت: ${statusText}\n📅 تاریخ: ${new Date(order.created_at).toLocaleDateString('fa-IR')}\n\n`;
    }
    
    await this.sendMessage(chatId, message);
  }

  async showOrdersManagement(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    const pendingCount = await this.orderRepo.count({ where: { status: 0 } });
    const approvedCount = await this.orderRepo.count({ where: { status: 1 } });
    const rejectedCount = await this.orderRepo.count({ where: { status: 2 } });
    
    await this.sendMessage(chatId, 
      `📋 **مدیریت سفارشات**\n\n` +
      `📊 آمار سفارشات:\n` +
      `• ⏳ در انتظار تایید: ${pendingCount}\n` +
      `• ✅ تایید شده: ${approvedCount}\n` +
      `• ❌ رد شده: ${rejectedCount}\n\n` +
      `لطفاً یکی از گزینه‌های زیر را انتخاب کنید:`,
      {
        parse_mode: 'Markdown',
        ...ordersManagementKeyboard
      }
    );
  }

  async showSubsPanel(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    const hasSub = await this.sub.hasSub();
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔗 مشاهده ساب لینک', callback_data: 'admin_view_sub' }],
          [{ text: '✏️ ویرایش ساب لینک', callback_data: 'admin_edit_sub' }],
          [{ text: '🗑 حذف ساب لینک', callback_data: 'admin_delete_sub' }],
          [{ text: '🔙 بازگشت', callback_data: 'admin_menu' }]
        ]
      }
    };
    
    await this.sendMessage(chatId, `📊 **مدیریت ساب لینک**\n\n📋 وضعیت: ${hasSub ? '✅ تنظیم شده' : '❌ تنظیم نشده'}`, keyboard);
  }

  async showSub(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    const subLink = await this.sub.getSub();
    if (!subLink) {
      await this.sendMessage(chatId, '⚠️ هیچ ساب لینکی تنظیم نشده است.');
      return;
    }
    
    await this.sendMessage(chatId, `🔗 **ساب لینک فعلی:**\n\`${subLink}\``, { parse_mode: 'Markdown' });
  }

  async startEditSub(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    adminStates.set(userId, { action: 'edit_sub', step: 1 });
    await this.sendMessage(chatId, 
      `✏️ **ویرایش ساب لینک**\n\nلطفاً لینک جدید را وارد کنید:\n\n🔄 برای لغو: /cancel`,
      { parse_mode: 'Markdown' }
    );
  }

  async deleteSub(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    const hasSub = await this.sub.hasSub();
    if (!hasSub) {
      await this.sendMessage(chatId, '⚠️ هیچ ساب لینکی وجود ندارد.');
      return;
    }
    
    await this.sub.deleteSub();
    await this.sendMessage(chatId, '✅ ساب لینک با موفقیت حذف شد.');
  }

  async selectPlan(chatId: number, userId: number, data: string) {
    console.log('🎯 selectPlan called');
    const planId = parseInt(data.split('_')[1]);
    const pendingKey = `pending_order_${userId}`;
    const existingPending = await this.cache.get(pendingKey);
    
    if (existingPending) {
      await this.sendMessage(chatId, '⚠️ شما یک سفارش در انتظار تایید دارید.');
      return;
    }
    
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) {
      await this.sendMessage(chatId, '❌ پلن مورد نظر یافت نشد.');
      return;
    }
    
    const canPurchase = await this.stock.canPurchase(planId);
    if (!canPurchase) {
      await this.sendMessage(chatId, '⚠️ متأسفانه این پلن به اتمام رسیده است.');
      return;
    }
    
    adminStates.set(userId, { action: 'waiting_for_receipt', planId });
    
    const displayPrice = plan.has_discount && plan.discounted_price ? plan.discounted_price : plan.price;
    const cardNumber = process.env.CARD_NUMBER || '**********';
    const cardHolder = process.env.CARD_HOLDER || '**********';
    
    const message = 
      `📋 **مشخصات پلن انتخاب شده**\n\n` +
      `📌 نام: ${plan.name}\n` +
      `💰 قیمت: ${displayPrice.toLocaleString()} تومان` +
      (plan.has_discount ? ` (قیمت اصلی: ${plan.price.toLocaleString()} تومان)` : '') + '\n' +
      `⏱ مدت: ${plan.duration_days} روز\n` +
      `📊 حجم: ${plan.bandwidth_gb === 0 ? '♾️ نامحدود' : plan.bandwidth_gb + ' گیگابایت'}\n\n` +
      `✅ برای ادامه، لطفاً مبلغ را به کارت زیر واریز کنید:\n\n` +
      `💳 شماره کارت: ${cardNumber}\n` +
      `🏦 به نام: ${cardHolder}\n\n` +
      `🖼 پس از واریز، تصویر رسید را ارسال کنید.`;
    
    await this.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📤 ارسال رسید', callback_data: `send_receipt_${planId}` }],
          [{ text: '🔙 بازگشت', callback_data: 'buy' }]
        ]
      }
    });
  }

  async waitForReceipt(chatId: number, userId: number, data: string) {
    const planId = parseInt(data.split('_')[2]);
    adminStates.set(userId, { action: 'waiting_for_receipt', planId });
    await this.sendMessage(chatId, '🖼 لطفاً تصویر رسید خود را ارسال کنید.');
  }

  async processReceipt(msg: any, state: any) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const photo = msg.photo[msg.photo.length - 1];
    const plan = await this.planRepo.findOne({ where: { id: state.planId } });
    
    const order = this.orderRepo.create({
      user_id: userId,
      plan_id: state.planId,
      amount: plan.has_discount && plan.discounted_price ? plan.discounted_price : plan.price,
      payment_receipt_file_id: photo.file_id,
      status: 0,
    });
    
    const savedOrder = await this.orderRepo.save(order);
    await this.cache.set(`pending_order_${userId}`, { orderId: savedOrder.id }, 86400);
    
    const adminGroupId = process.env.ADMIN_GROUP_ID;
    const username = msg.from.username ? `@${msg.from.username}` : `[${msg.from.first_name}](tg://user?id=${userId})`;
    
    const adminMessage = 
      `🆕 **سفارش جدید!**\n\n` +
      `👤 کاربر: ${username}\n` +
      `🆔 آیدی: <code>${userId}</code>\n` +
      `📦 پلن: ${plan.name}\n` +
      `💰 مبلغ: ${savedOrder.amount.toLocaleString()} تومان\n` +
      `🆔 شماره سفارش: #${savedOrder.id}\n` +
      `📅 تاریخ: ${new Date().toLocaleDateString('fa-IR')}`;
    
    if (adminGroupId) {
      const sentMessage = await this.bot.sendPhoto(adminGroupId, photo.file_id, {
        caption: adminMessage,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ تایید سفارش', callback_data: `approve_order_${savedOrder.id}` },
            { text: '❌ رد سفارش', callback_data: `reject_order_${savedOrder.id}` }
          ]]
        }
      });
      
      // ذخیره message_id برای حذف بعدی
      savedOrder.admin_message_id = sentMessage.message_id;
      await this.orderRepo.save(savedOrder);
    }
    
    await this.sendMessage(chatId, `✅ سفارش شما با شماره #${savedOrder.id} ثبت شد. پس از بررسی، نتیجه به شما اطلاع داده می‌شود.`);
    adminStates.delete(userId);
  }

  async approveOrder(data: string, adminChatId: number, adminId: number) {
    const orderId = parseInt(data.split('_')[2]);
    const order = await this.orderRepo.findOne({ 
      where: { id: orderId }, 
      relations: ['plan', 'user']
    });
    
    if (!order) {
      await this.sendMessage(adminChatId, '❌ سفارش یافت نشد.');
      return;
    }
    
    if (order.admin_message_id) {
      try {
        await this.bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          { chat_id: adminChatId, message_id: order.admin_message_id }
        );
      } catch (error) {
        console.error('Failed to remove buttons:', error.message);
      }
    }
    
    const config = await this.stock.reserveConfig(order.plan_id);
    if (!config) {
      await this.sendMessage(adminChatId, '❌ کانفیگ به اتمام رسیده است.');
      await this.sendMessage(order.user_id, '❌ متأسفانه کانفیگ مورد نظر به اتمام رسیده است.');
      return;
    }
    
    order.status = 1;
    order.config_id = config.id;
    order.approved_at = new Date();
    await this.orderRepo.save(order);
    config.is_sold_out = true;
    await this.configRepo.save(config);
    await this.cache.del(`pending_order_${order.user_id}`);
    
    const successMessage = 
      `🎉 **تبریک!** 🎉\n\n` +
      `✅ سفارش شما با موفقیت تایید شد!\n\n` +
      `┌─────────────────────┐\n` +
      `│ 👤 کاربر: ${order.user.first_name}\n` +
      `│ 🆔 سفارش: #${order.id}\n` +
      `│ 📦 پلن: ${order.plan?.name}\n` +
      `│ 💰 مبلغ: ${order.amount.toLocaleString()} تومان\n` +
      `│ 📅 تاریخ: ${new Date().toLocaleDateString('fa-IR')}\n` +
      `└─────────────────────┘\n\n` +
      `🔗 لینک اشتراک شما آماده دریافت است.`;
    
    await this.sendMessage(order.user_id, successMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔗 دریافت لینک اشتراک', callback_data: `get_config_link_${order.id}` }],
          [{ text: '🏠 بازگشت به صفحه اصلی', callback_data: 'main_menu' }]
        ]
      }
    });
    
    await this.sendMessage(adminChatId, `✅ سفارش #${order.id} تایید شد.`);
  }
  
  async sendConfigLink(chatId: number, userId: number, orderId: number) {
    const order = await this.orderRepo.findOne({ where: { id: orderId, user_id: userId } });
    
    if (!order || order.status !== 1) {
      await this.sendMessage(chatId, '❌ سفارش یافت نشد یا هنوز تایید نشده است.');
      return;
    }
    
    const config = await this.configRepo.findOne({ where: { id: order.config_id } });
    const subLink = await this.sub.getSub();
    
    let message = 
      `🔗 **لینک اشتراک شما**\n\n` +
      `┌─────────────────────┐\n`;
    
    message += `│\n│ 🔗 ساب لینک:\n│ \`${subLink}${config.config_link}\`\n`;
    
    message += 
      `└─────────────────────┘\n\n` +
      `📌 برای کپی کردن، روی لینک کلیک کنید.`;
    
    await this.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🏠 بازگشت به صفحه اصلی', callback_data: 'main_menu' }]
        ]
      }
    });
  }

  async rejectOrder(data: string, adminChatId: number, adminId: number) {
    const orderId = parseInt(data.split('_')[2]);
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    
    if (!order) {
      await this.sendMessage(adminChatId, '❌ سفارش یافت نشد.');
      return;
    }
    
    if (order.admin_message_id) {
      try {
        await this.bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          { chat_id: adminChatId, message_id: order.admin_message_id }
        );
      } catch (error) {
        console.error('Failed to remove buttons:', error.message);
      }
    }
    
    order.status = 2;
    await this.orderRepo.save(order);
    await this.cache.del(`pending_order_${order.user_id}`);
    
    const rejectMessage = 
      `❌ **متأسفانه** ❌\n\n` +
      `سفارش شما تایید نشد.\n\n` +
      `┌─────────────────────┐\n` +
      `│ 🆔 سفارش: #${order.id}\n` +
      `│ 📅 تاریخ: ${new Date().toLocaleDateString('fa-IR')}\n` +
      `└─────────────────────┘\n\n` +
      `📞 لطفاً با پشتیبانی تماس بگیرید.`;
    
    await this.sendMessage(order.user_id, rejectMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🏠 بازگشت به صفحه اصلی', callback_data: 'main_menu' }]
        ]
      }
    });
    
    await this.sendMessage(adminChatId, `✅ سفارش #${order.id} رد شد.`);
  }

  async addConfig(msg: any, match: RegExpExecArray) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    console.log('=========================================');
    console.log('🔍 addConfig method called');
    console.log('📝 Full message:', msg.text);
    console.log('👤 User ID:', userId);
    
    // بررسی دسترسی ادمین
    const isAdmin = await this.adminMiddleware.isAdmin(userId);
    console.log('👑 Is admin:', isAdmin);
    
    if (!isAdmin) {
      await this.sendMessage(chatId, '❌ شما دسترسی به این بخش ندارید.');
      console.log('❌ Access denied - not admin');
      return;
    }
    
    // بررسی وجود match و مقادیر
    if (!match) {
      console.log('❌ Match is null or undefined');
      await this.sendMessage(chatId, '❌ فرمت دستور اشتباه است. از /add_config [planId] [link] استفاده کنید.');
      return;
    }
    
    console.log('📊 Match groups:', match);
    console.log('📊 Match length:', match.length);
    
    if (match.length < 3) {
      console.log('❌ Not enough match groups. Expected planId and configLink');
      await this.sendMessage(chatId, '❌ فرمت دستور اشتباه است. از /add_config [planId] [link] استفاده کنید.');
      return;
    }
    
    const planId = parseInt(match[1]);
    const configLinks = match[2];
    
    console.log(`📦 Plan ID: ${planId} (type: ${typeof planId})`);
    console.log(`🔗 Config links: ${configLinks}`);
    
    if (isNaN(planId)) {
      console.log('❌ Invalid planId - not a number');
      await this.sendMessage(chatId, '❌ آیدی پلن باید یک عدد باشد.');
      return;
    }
    
    // بررسی وجود پلن
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    console.log(`📦 Plan found: ${plan ? plan.name : 'NOT FOUND'}`);
    
    if (!plan) {
      await this.sendMessage(chatId, '❌ پلن مورد نظر یافت نشد.');
      return;
    }
    
    await this.sendMessage(chatId, '🔄 در حال پردازش لینک‌ها...');
    console.log('🔄 Processing links...');
    
    try {
      console.log('📞 Calling stock.addConfigs with:', { planId, configLinks });
      const result = await this.stock.addConfigs(planId, configLinks);
      console.log('📊 Result from stock.addConfigs:', JSON.stringify(result));
      
      let message = `✅ **نتیجه افزودن کانفیگ به پلن ${plan.name}**\n\n`;
      message += `📊 افزوده شده: ${result.added} عدد\n`;
      message += `⚠️ تکراری: ${result.duplicates.length} عدد\n`;
      message += `❌ خطا: ${result.failed.length} عدد\n`;
      
      if (result.added > 0) {
        const remainingStock = await this.stock.getRemainingStock(planId);
        message += `\n📦 موجودی فعلی پلن: ${remainingStock}`;
      }
      
      if (result.duplicates.length > 0) {
        message += `\n\n⚠️ لینک‌های تکراری:\n`;
        for (const dup of result.duplicates.slice(0, 3)) {
          message += `• ${dup.substring(0, 50)}...\n`;
        }
      }
      
      if (result.failed.length > 0) {
        message += `\n\n❌ لینک‌های نامعتبر:\n`;
        for (const fail of result.failed.slice(0, 3)) {
          message += `• ${fail.substring(0, 50)}...\n`;
        }
      }
      
      console.log('✅ Sending success message to user');
      await this.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('❌ Error in addConfig catch block:', error);
      console.error('❌ Error stack:', error.stack);
      await this.sendMessage(chatId, `❌ خطا: ${error.message}`);
    }
    
    console.log('=========================================');
  }

  async addSub(msg: any, match: RegExpExecArray) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const subLink = match[1];
    
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    await this.sub.setSub(subLink);
    await this.sendMessage(chatId, `✅ ساب لینک با موفقیت اضافه شد!`);
  }

  async handleTextMessage(msg: any) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    const state = adminStates.get(userId);
    
    if (text === '/cancel') {
      adminStates.delete(userId);
      await this.sendMessage(chatId, '✅ عملیات لغو شد.');
      return;
    }
    
    if (state?.action === 'add_sub' && state.step === 1) {
      if (!text.startsWith('http')) {
        await this.sendMessage(chatId, '❌ لینک نامعتبر است.');
        return;
      }
      await this.sub.setSub(text);
      await this.sendMessage(chatId, `✅ ساب لینک اضافه شد: ${text}`);
      adminStates.delete(userId);
      return;
    }
    
    if (state?.action === 'edit_sub' && state.step === 1) {
      if (!text.startsWith('http')) {
        await this.sendMessage(chatId, '❌ لینک نامعتبر است.');
        return;
      }
      await this.sub.setSub(text);
      await this.sendMessage(chatId, `✅ ساب لینک با موفقیت به‌روزرسانی شد:\n\`${text}\``, { parse_mode: 'Markdown' });
      adminStates.delete(userId);
      return;
    }

    // در handleTextMessage
if (state?.action === 'add_plan') {
  const step = state.step;
  const data = state.data || {};
  
  if (step === 1) {
    data.name = text;
    state.step = 2;
    await this.sendMessage(chatId, '📝 **مرحله 2/5:** توضیحات پلن را وارد کنید:');
  } else if (step === 2) {
    data.description = text;
    state.step = 3;
    await this.sendMessage(chatId, '💰 **مرحله 3/5:** قیمت پلن را به تومان وارد کنید:');
  } else if (step === 3) {
    const price = parseInt(text);
    if (isNaN(price)) {
      await this.sendMessage(chatId, '❌ لطفاً یک عدد معتبر وارد کنید.');
      return;
    }
    data.price = price;
    state.step = 4;
    await this.sendMessage(chatId, '⏱ **مرحله 4/5:** مدت اعتبار را به روز وارد کنید:');
  } else if (step === 4) {
    const days = parseInt(text);
    if (isNaN(days)) {
      await this.sendMessage(chatId, '❌ لطفاً یک عدد معتبر وارد کنید.');
      return;
    }
    data.duration_days = days;
    state.step = 5;
    await this.sendMessage(chatId, '📊 **مرحله 5/5:** حجم ترافیک را به گیگابایت وارد کنید (0 = نامحدود):');
  } else if (step === 5) {
    const bandwidth = parseInt(text);
    if (isNaN(bandwidth)) {
      await this.sendMessage(chatId, '❌ لطفاً یک عدد معتبر وارد کنید.');
      return;
    }
    data.bandwidth_gb = bandwidth;
    data.is_active = true;
    
    try {
      const newPlan = await this.planAdmin.createPlan(data);
      await this.sendMessage(chatId, 
        `✅ **پلن با موفقیت ایجاد شد!**\n\n` +
        `📌 نام: ${newPlan.name}\n` +
        `💰 قیمت: ${newPlan.price.toLocaleString()} تومان\n` +
        `⏱ مدت: ${newPlan.duration_days} روز\n` +
        `📊 حجم: ${newPlan.bandwidth_gb === 0 ? 'نامحدود' : newPlan.bandwidth_gb + ' گیگ'}\n\n` +
        `🔗 حالا برای فعال کردن این پلن، کانفیگ اضافه کنید:\n` +
        `/add_config ${newPlan.id} [لینک_کانفیگ]`);
    } catch (error) {
      await this.sendMessage(chatId, `❌ خطا در ایجاد پلن: ${error.message}`);
    }
    adminStates.delete(userId);
  }
  adminStates.set(userId, state);
  return;
}
  }

  async ensureMembership(userId: number, chatId: number): Promise<boolean> {
    return this.channelMiddleware.ensureMembership(this.bot, userId, chatId);
  }

  async sendMessage(chatId: number, text: string, options?: any) {
    try {
      return await this.bot.sendMessage(chatId, text, options);
    } catch (error) {
      console.error('SendMessage error:', error.message);
      return await this.bot.sendMessage(chatId, text);
    }
  }

  async answerCallback(id: string) {
    try { await this.bot.answerCallbackQuery(id); } catch (e) { console.error(e); }
  }

  getAdminState(userId: number) { return adminStates.get(userId); }

  async hasPendingOrder(userId: number): Promise<boolean> {
    const pending = await this.cache.get(`pending_order_${userId}`);
    return !!pending;
  }

  private async upsertUser(userId: number) {
    const exists = await this.userRepo.findOne({ where: { id: userId } });
    if (!exists) await this.userRepo.save({ id: userId, status: true });
  }

  async showPlansList(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    const plans = await this.planAdmin.getAllPlans();
    if (!plans.length) {
      await this.sendMessage(chatId, '⚠️ هیچ پلنی یافت نشد.');
      return;
    }
    
    const planButtons = plans.map(plan => [
      { text: `${plan.id}. ${plan.name} - ${plan.is_active ? '✅' : '❌'}`, callback_data: `admin_select_plan_${plan.id}` }
    ]);
    
    await this.sendMessage(chatId, '📋 **لیست پلن‌ها:**', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: planButtons }
    });
  }

  async startAddPlan(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    adminStates.set(userId, { action: 'add_plan', step: 1, data: {} });
    await this.sendMessage(chatId, 
      `➕ **افزودن پلن جدید**\n\n` +
      `📝 **مرحله 1/5:** نام پلن را وارد کنید:\n\n` +
      `مثال: "ماهانه 50 گیگ"\n\n` +
      `🔄 برای لغو: /cancel`,
      { parse_mode: 'Markdown' }
    );
  }

  async showPlansForConfig(chatId: number, userId: number) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    const plans = await this.planRepo.find({ where: { is_active: true } });
    if (!plans.length) {
      await this.sendMessage(chatId, '⚠️ هیچ پلن فعالی وجود ندارد.');
      return;
    }
    
    const planButtons = plans.map(plan => [
      { text: `${plan.id}. ${plan.name}`, callback_data: `admin_select_plan_for_config_${plan.id}` }
    ]);
    
    await this.sendMessage(chatId, '📦 **لطفاً پلن مورد نظر را انتخاب کنید:**', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [...planButtons, [{ text: '🔙 بازگشت', callback_data: 'admin_menu' }]] }
    });
  }

  async startAddConfig(chatId: number, userId: number, data: string) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    const planId = parseInt(data.split('_')[5]);
    adminStates.set(userId, { action: 'add_configs', step: 1, planId });
    await this.sendMessage(chatId, 
      `🔗 **افزودن کانفیگ به پلن #${planId}**\n\n` +
      `لطفاً لینک‌های کانفیگ را وارد کنید.\n\n🔄 برای لغو: /cancel`,
      { parse_mode: 'Markdown' }
    );
  }

  async showPlanDetail(chatId: number, data: string) {
    const planId = parseInt(data.split('_')[3]);
    const plan = await this.planAdmin.getPlanById(planId);
    
    if (!plan) {
      await this.sendMessage(chatId, '❌ پلن یافت نشد.');
      return;
    }
    
    const message = this.planAdmin.formatPlanMessage(plan);
    const actionKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✏️ ویرایش', callback_data: `admin_edit_plan_${planId}` },
            { text: '🗑 حذف', callback_data: `admin_delete_plan_${planId}` }
          ],
          [
            { text: '🔄 تغییر وضعیت', callback_data: `admin_toggle_plan_${planId}` },
            { text: '📊 موجودی', callback_data: `admin_edit_stock_${planId}` }
          ],
          [{ text: '🔙 بازگشت', callback_data: 'admin_list_plans' }]
        ]
      }
    };
    
    await this.sendMessage(chatId, message, { parse_mode: 'Markdown', ...actionKeyboard });
  }

  async checkMembership(chatId: number, userId: number) {
    const isMember = await this.ensureMembership(userId, chatId);
    if (isMember) {
      const isAdmin = await this.adminMiddleware.isAdmin(userId);
      await this.sendMessage(chatId, '✅ عضویت شما تأیید شد!', {
        reply_markup: { keyboard: this.messageHelper.getMainKeyboard(isAdmin) }
      });
    }
  }

  async togglePlanStatus(chatId: number, userId: number, data: string) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    const planId = parseInt(data.split('_')[3]);
    const plan = await this.planAdmin.togglePlanStatus(planId);
    
    if (plan) {
      await this.sendMessage(chatId, `✅ وضعیت پلن "${plan.name}" تغییر کرد.`);
    } else {
      await this.sendMessage(chatId, '❌ پلن یافت نشد.');
    }
  }

  async deletePlan(chatId: number, userId: number, data: string) {
    if (!await this.adminMiddleware.isAdmin(userId)) return;
    
    const planId = parseInt(data.split('_')[3]);
    const success = await this.planAdmin.deletePlan(planId);
    
    if (success) {
      await this.sendMessage(chatId, '✅ پلن با موفقیت حذف شد.');
    } else {
      await this.sendMessage(chatId, '❌ خطا در حذف پلن.');
    }
  }

  async stop() {
    if (this.bot) {
      try {
        await this.bot.stopPolling();
        this.bot.removeAllListeners();
        this.isPolling = false;
        console.log('✅ Bot stopped gracefully');
      } catch (error) {
        console.error('Error stopping bot:', error.message);
      }
    }
  }
}