import { adminStates } from './states/admin.state';
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
import { PlanHandler } from './handlers/plan.handler';
import { UserHandler } from './handlers/user.handler';
import { OrderHandler } from './handlers/order.handler';
import { ConfigHandler } from './handlers/config.handler';
import { SubHandler } from './handlers/sub.handler';
import { DiscountHandler } from './handlers/discount.handler';
import { ServiceHandler } from './handlers/service.handler';
import { CallbackHandler } from './handlers/callback.handler';
import { getMainKeyboard } from './keyboards/main.keyboard';
import { convert } from 'telegram-markdown-v2';

const TelegramBot = require('node-telegram-bot-api');

@Injectable()
export class BotService {
  public bot: any;
  public messageHelper: MessageHelper;
  public planHandler: PlanHandler;
  public userHandler: UserHandler;
  public orderHandler: OrderHandler;
  public configHandler: ConfigHandler;
  public discountHandler: DiscountHandler;
  public serviceHandler: ServiceHandler;
  public subHandler: SubHandler;

  constructor(
    @InjectRepository(User) public userRepo: Repository<User>,
    @InjectRepository(Plan) public planRepo: Repository<Plan>,
    @InjectRepository(Order) public orderRepo: Repository<Order>,
    @InjectRepository(Config) public configRepo: Repository<Config>,
    public dataSource: DataSource,
    public cache: CacheService,
    public channelMiddleware: ChannelMiddleware,
    public adminMiddleware: AdminMiddleware,
    public planAdmin: PlanAdminService,
    public stock: StockService,
    public sub: SubService,
    public stockChecker: StockCheckerService,
  ) {
    this.messageHelper = new MessageHelper();
    this.planHandler = new PlanHandler(this);
    this.userHandler = new UserHandler(this);
    this.orderHandler = new OrderHandler(this);
    this.configHandler = new ConfigHandler(this);
    this.discountHandler = new DiscountHandler(this);
    this.serviceHandler = new ServiceHandler(this);
    this.subHandler = new SubHandler(this);
  }

  async init(token: string) {
    try {
      this.bot = new TelegramBot(token, { polling: true });
      this.setupHandlers();
      
      const adminGroupId = process.env.ADMIN_GROUP_ID;
      if (adminGroupId) {
        await this.stockChecker.startChecking(this.bot, adminGroupId);
      }
      
      console.log('✅ Telegram bot started!');
      return this.bot;
    } catch (error) {
      console.error('❌ Failed to initialize bot:', error.message);
      throw error;
    }
  }

  async stop() {
    try {
      if (this.bot) {
        await this.bot.stopPolling();
        this.bot.removeAllListeners();
        console.log('✅ Bot stopped gracefully');
      }
    } catch (error) {
      console.error('Error stopping bot:', error.message);
    }
  }

  private setupHandlers() {
    try {
      this.bot.onText(/\/start/, (m) => this.userHandler.handleStart(m.chat.id, m.from.id, m.chat.first_name || 'کاربر'));
      this.bot.onText(/🛒 خرید VPN/, (m) => this.userHandler.showPlans(
        m.chat.id, 
        m.from.id, 
        m.from.username, 
        m.from.first_name, 
        m.from.last_name
      ));
      this.bot.onText(/🛍️ سرویس‌های من/, (m) => this.userHandler.showUserServices(m.chat.id, m.from.id));
      this.bot.onText(/💬 پشتیبانی/, (m) => this.userHandler.handleSupport(m.chat.id));
      this.bot.onText(/🔧 نحوه اتصال/, (m) => this.userHandler.handleHowToConnect(m.chat.id));
      this.bot.onText(/🛠 پنل مدیریت/, (m) => this.planHandler.showPanel(m.chat.id, m.from.id));
      this.bot.onText(/\/add_config\s+(\d+)\s+(.+)/, (m, match) => this.configHandler.handleAddConfig(m.chat.id, m.from.id, m.text));
      this.bot.onText(/\/add_sub (.+)/, (m, match) => this.subHandler.addSub(m.chat.id, m.from.id, match[1]));
      this.bot.onText(/\/list_subs/, (m) => this.subHandler.showSub(m.chat.id, m.from.id));
      this.bot.onText(/\/check_stock/, (m) => this.stockChecker.checkAndNotify(this.bot, m.chat.id.toString()));
      this.bot.on('callback_query', (q) => new CallbackHandler(this).handle(q));
      this.bot.on('photo', (m) => this.orderHandler.handleReceipt(m));
      this.bot.on('message', (m) => this.handleTextMessage(m));
    } catch (error) {
      console.error('Error setting up handlers:', error.message);
    }
  }

  private async handleTextMessage(msg: any) {
    try {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const text = msg.text;
      const state = this.getAdminState(userId);
      
      if (text === '/cancel') {
        this.clearAdminState(userId);
        await this.sendMessage(chatId, '✅ عملیات لغو شد.');
        return;
      }

      if (state?.action === 'set_discount_price') {
        await this.discountHandler.setDiscountPrice(chatId, userId, text);
        return;
      }

      if (state?.action === 'add_plan') {
        await this.planHandler.processAddPlan(chatId, userId, text, state);
        return;
      }

      if (state?.action === 'edit_plan') {
        await this.planHandler.processEditPlan(chatId, userId, text, state);
        return;
      }

      if (state?.action === 'add_configs') {
        await this.configHandler.processAddConfigs(chatId, userId, text, state);
        return;
      }
      
      if (state?.action === 'add_sub') {
        await this.subHandler.processAddSub(chatId, userId, text, state);
        return;
      }

      if (state?.action === 'edit_sub') {
        await this.subHandler.processEditSub(chatId, userId, text, state);
        return;
      }
    } catch (error) {
      console.error('Error in handleTextMessage:', error.message);
      await this.sendMessage(msg.chat.id, '❌ خطایی رخ داد. لطفاً دوباره تلاش کنید.').catch(() => {});
    }
  }

  async sendMessage(chatId: number, text: string, options?: any) {
    try {
        if (!text || text.trim() === '') {
            console.warn('⚠️ متن ارسالی خالی است');
            return null;
        }

        let finalOptions = { ...options };
        
        if (options?.parse_mode === 'MarkdownV2') {
            // تبدیل خودکار و ایمن Markdown به فرمت استاندارد تلگرام
            const safeText = convert(text, 'escape');
            finalOptions = { ...options, text: safeText };
            return await this.bot.sendMessage(chatId, safeText, finalOptions);
        }
        
        if (options?.parse_mode === 'HTML') {
            return await this.bot.sendMessage(chatId, text, finalOptions);
        }
        
        return await this.bot.sendMessage(chatId, text, finalOptions);
        
    } catch (error) {
        console.error('خطا در ارسال پیام:', error.message);
        try {
            const { parse_mode, ...restOptions } = options || {};
            return await this.bot.sendMessage(chatId, text, restOptions);
        } catch (fallbackError) {
            console.error('خطا در ارسال مجدد پیام:', fallbackError.message);
            return null;
        }
    }
}
  
  async answerCallback(id: string) {
    try { 
      await this.bot.answerCallbackQuery(id); 
    } catch (e) { 
      console.error('Answer callback error:', e.message); 
    }
  }

  async ensureMembership(userId: number, chatId: number): Promise<boolean> {
    try {
      return await this.channelMiddleware.ensureMembership(this.bot, userId, chatId);
    } catch (error) {
      console.error('Error checking membership:', error.message);
      return false;
    }
  }

  async checkMembership(chatId: number, userId: number) {
    try {
      const isMember = await this.ensureMembership(userId, chatId);
      if (isMember) {
        const isAdmin = await this.adminMiddleware.isAdmin(userId);
        const keyboard = getMainKeyboard(isAdmin);
        await this.sendMessage(chatId, '✅ عضویت شما تأیید شد! حالا می‌توانید از ربات استفاده کنید.', keyboard);
      }
    } catch (error) {
      console.error('Error in checkMembership:', error.message);
      await this.sendMessage(chatId, '❌ خطا در بررسی عضویت. لطفاً دوباره تلاش کنید.');
    }
  }

  async upsertUser(userId: number, username?: string, firstName?: string, lastName?: string) {
    try {
      const existingUser = await this.userRepo.findOne({ where: { id: userId } });
      
      if (!existingUser) {
        const newUser = this.userRepo.create({
          id: userId,
          username: username || null,
          first_name: firstName || null,
          last_name: lastName || null,
          status: true,
          is_member_of_channel: false,
        });
        await this.userRepo.save(newUser);
        console.log(`✅ New user created: ${userId} (${firstName || 'no name'})`);
      } else {
        if (username && existingUser.username !== username) {
          existingUser.username = username;
        }
        if (firstName && existingUser.first_name !== firstName) {
          existingUser.first_name = firstName;
        }
        if (lastName && existingUser.last_name !== lastName) {
          existingUser.last_name = lastName;
        }
        await this.userRepo.save(existingUser);
      }
    } catch (error) {
      console.error('Error upserting user:', error.message);
    }
  }

  getAdminState(userId: number): any {
    try {
      return adminStates.get(userId);
    } catch (error) {
      console.error('Error getting admin state:', error.message);
      return null;
    }
  }
  
  setAdminState(userId: number, state: any) {
    try {
      adminStates.set(userId, state);
    } catch (error) {
      console.error('Error setting admin state:', error.message);
    }
  }
  
  clearAdminState(userId: number) {
    try {
      adminStates.delete(userId);
    } catch (error) {
      console.error('Error clearing admin state:', error.message);
    }
  }
}