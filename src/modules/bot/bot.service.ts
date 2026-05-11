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
    this.bot = new TelegramBot(token, { polling: true });
    this.setupHandlers();
    
    const adminGroupId = process.env.ADMIN_GROUP_ID;
    if (adminGroupId) {
      await this.stockChecker.startChecking(this.bot, adminGroupId);
    }
    
    console.log('✅ Telegram bot started!');
    return this.bot;
  }

  async stop() {
    if (this.bot) {
      try {
        await this.bot.stopPolling();
        this.bot.removeAllListeners();
        console.log('✅ Bot stopped gracefully');
      } catch (error) {
        console.error('Error stopping bot:', error.message);
      }
    }
  }

  private setupHandlers() {
    this.bot.onText(/\/start/, (m) => this.userHandler.handleStart(m.chat.id, m.from.id, m.chat.first_name || 'کاربر'));
    this.bot.onText(/🛒 خرید VPN/, (m) => this.userHandler.showPlans(m.chat.id, m.from.id));
    this.bot.onText(/🛍️ سرویس‌های من/, (m) => this.userHandler.showUserServices(m.chat.id, m.from.id));
    this.bot.onText(/💬 پشتیبانی/, (m) => this.userHandler.handleSupport(m.chat.id));
    this.bot.onText(/🔧 نحوه اتصال/, (m) => this.userHandler.handleHowToConnect(m.chat.id));
    this.bot.onText(/🛠 پنل مدیریت/, (m) => this.planHandler.showPanel(m.chat.id, m.from.id));
    this.bot.onText(/\/add_config\s+(\d+)\s+(.+)/, (m) => this.configHandler.handleAddConfig(m.chat.id, m.from.id, m.text));
    this.bot.onText(/\/add_sub (.+)/, (m, match) => this.subHandler.addSub(m.chat.id, m.from.id, match[1]));
    this.bot.onText(/\/list_subs/, (m) => this.subHandler.showSub(m.chat.id, m.from.id));
    this.bot.onText(/\/check_stock/, (m) => this.stockChecker.checkAndNotify(this.bot, m.chat.id.toString()));
    this.bot.on('callback_query', (q) => new CallbackHandler(this).handle(q));
    this.bot.on('photo', (m) => this.orderHandler.handleReceipt(m));
    this.bot.on('message', (m) => this.handleTextMessage(m));
  }

  private async handleTextMessage(msg: any) {
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
    try { 
      await this.bot.answerCallbackQuery(id); 
    } catch (e) { 
      console.error('Answer callback error:', e.message); 
    }
  }

  async ensureMembership(userId: number, chatId: number): Promise<boolean> {
    return this.channelMiddleware.ensureMembership(this.bot, userId, chatId);
  }

  async checkMembership(chatId: number, userId: number) {
    const isMember = await this.ensureMembership(userId, chatId);
    if (isMember) {
      const isAdmin = await this.adminMiddleware.isAdmin(userId);
      const keyboard = getMainKeyboard(isAdmin);
      await this.sendMessage(chatId, '✅ عضویت شما تأیید شد! حالا می‌توانید از ربات استفاده کنید.', keyboard);
    }
  }

  async upsertUser(userId: number) {
    const exists = await this.userRepo.findOne({ where: { id: userId } });
    if (!exists) await this.userRepo.save({ id: userId, status: true });
  }

  getAdminState(userId: number): any {
    return adminStates.get(userId);
  }
  
  setAdminState(userId: number, state: any) {
    adminStates.set(userId, state);
  }
  
  clearAdminState(userId: number) {
    adminStates.delete(userId);
  }
}