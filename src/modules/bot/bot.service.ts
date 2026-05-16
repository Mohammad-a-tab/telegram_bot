import { Injectable, Logger } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { AdminStateManager } from './states/admin.state';
import { CallbackHandler } from './handlers/callback.handler';
import { UserHandler } from './handlers/user.handler';
import { OrderHandler } from './handlers/order.handler';
import { PlanHandler } from './handlers/plan.handler';
import { ConfigHandler } from './handlers/config.handler';
import { DiscountHandler } from './handlers/discount.handler';
import { CouponHandler } from './handlers/coupon.handler';
import { SubHandler } from './handlers/sub.handler';
import { StockCheckerService } from '../stock/services';
import { ReferralService } from '../referral/services/referral.service';
import { ReferralHandler } from '../referral/handlers/referral.handler';
import { CacheService } from '../cache/cache.service';
import { BroadcastHandler } from './handlers/broadcast.handler';
import { UserService } from '../user/services/user.service';

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  public bot: any;

  constructor(
    private readonly stateManager: AdminStateManager,
    private readonly callbackHandler: CallbackHandler,
    private readonly userHandler: UserHandler,
    private readonly orderHandler: OrderHandler,
    private readonly planHandler: PlanHandler,
    private readonly configHandler: ConfigHandler,
    private readonly discountHandler: DiscountHandler,
    private readonly couponHandler: CouponHandler,
    private readonly subHandler: SubHandler,
    private readonly stockChecker: StockCheckerService,
    private readonly referralService: ReferralService,
    private readonly referralHandler: ReferralHandler,
    private readonly cacheService: CacheService,
    private readonly userService: UserService,
    private readonly broadcastHandler: BroadcastHandler,
  ) {}

  async init(token: string): Promise<void> {
    this.bot = new TelegramBot(token, { polling: true });
    this.registerHandlers();

    const adminGroupId = process.env.ADMIN_GROUP_ID;
    if (adminGroupId) {
      this.stockChecker.startChecking(this.bot, adminGroupId);
    }

    this.logger.log('Telegram bot started');
  }

  async stop(): Promise<void> {
    if (this.bot) {
      await this.bot.stopPolling();
      this.bot.removeAllListeners();
      this.logger.log('Bot stopped');
    }
  }

  private registerHandlers(): void {
    const b = this.bot;

    b.onText(/\/start(?:\s+(.+))?/, async (m, match) => {
      if (m.chat.type !== 'private') return;
      this.stateManager.clear(m.from.id);
      const payload = match?.[1]?.trim();
      const refCode = payload ? this.referralService.parseStartPayload(payload) : null;
      if (refCode) {
        // Only treat as a new invite if the user doesn't already exist in the DB.
        // Existing users who left and rejoined the channel must not count as referrals.
        const existingUser = await this.userService.findById(m.from.id);
        if (!existingUser) {
          const key = this.referralService.getPendingKey(m.from.id);
          this.cacheService.set(key, { refCode }, 60 * 60 * 24).catch(() => {});
        }
      }
      this.userHandler.handleStart(b, m.chat.id, m.from.id, m.from.first_name, m.from.last_name);
    });
    b.onText(/🛒 خرید VPN/, (m) => {
      if (m.chat.type !== 'private') return;
      this.stateManager.clear(m.from.id);
      this.userHandler.showPlans(b, m.chat.id, m.from.id, m.from.username, m.from.first_name, m.from.last_name);
    });
    b.onText(/🛍️ سرویس‌های من/, (m) => {
      if (m.chat.type !== 'private') return;
      this.stateManager.clear(m.from.id);
      this.userHandler.showUserServices(b, m.chat.id, m.from.id);
    });
    b.onText(/💬 پشتیبانی/, (m) => {
      if (m.chat.type !== 'private') return;
      this.stateManager.clear(m.from.id);
      this.userHandler.handleSupport(b, m.chat.id);
    });
    b.onText(/🔧 نحوه اتصال/, (m) => {
      if (m.chat.type !== 'private') return;
      this.stateManager.clear(m.from.id);
      this.userHandler.handleHowToConnect(b, m.chat.id);
    });
    b.onText(/👥 دعوت از دوستان/, (m) => {
      this.stateManager.clear(m.from.id);
      this.referralHandler.showInvitePage(b, m.chat.id, m.from.id).catch((e) => this.logger.error(e.message));
    });
    b.onText(/🛠 پنل مدیریت/, (m) => {
      if (m.chat.type !== 'private') return;
      this.stateManager.clear(m.from.id);
      this.planHandler.showPanel(b, m.chat.id, m.from.id);
    });

    b.on('callback_query', (q) =>
      this.callbackHandler.handle(b, q).catch((e) => this.logger.error(e.message)),
    );
    b.on('photo', (m) => {
      if (m.chat.type !== 'private') return;
      this.orderHandler.handleReceipt(b, m).catch((e) => this.logger.error(e.message));
    });
    b.on('message', (m) => {
      if (m.chat.type !== 'private') return;
      this.handleTextMessage(m).catch((e) => this.logger.error(e.message));
    });
  }

  private async handleTextMessage(msg: any): Promise<void> {
    // Only handle messages from private chats — ignore group/channel messages
    if (msg.chat.type !== 'private') return;

    const chatId: number = msg.chat.id;
    const userId: number = msg.from.id;
    const text: string = msg.text;

    if (!text) return;

    if (text === '/cancel') {
      this.stateManager.clear(userId);
      await this.bot.sendMessage(chatId, '✅ عملیات لغو شد.');
      return;
    }

    const state = this.stateManager.get(userId);
    if (!state) return;

    switch (state.action) {
      case 'set_discount_price':
        return this.discountHandler.setDiscountPrice(this.bot, chatId, userId, text);

      case 'waiting_for_coupon':
        return this.couponHandler.validateCoupon(this.bot, chatId, userId, text);

      case 'coupon_create':
        return this.couponHandler.processCreate(this.bot, chatId, userId, text);

      case 'add_plan':
        return this.planHandler.processAddPlan(this.bot, chatId, userId, text);

      case 'edit_plan':
        return this.planHandler.processEditPlan(this.bot, chatId, userId, text);

      case 'add_configs':
        return this.configHandler.processAddConfigs(this.bot, chatId, userId, text);

      case 'edit_sub':
        return this.subHandler.processEditSub(this.bot, chatId, userId, text);

      case 'delete_config': {
        const id = parseInt(text);
        if (!isNaN(id)) await this.configHandler.deleteConfig(this.bot, chatId, userId, id);
        this.stateManager.clear(userId);
        return;
      }

      // Fix: user is in receipt flow but sent text instead of photo — guide them
      case 'waiting_for_receipt':
        await this.bot.sendMessage(chatId, '🖼 لطفاً تصویر رسید پرداخت را ارسال کنید (نه متن).');
        return;

      case 'broadcast':
        return this.broadcastHandler.processBroadcast(this.bot, chatId, userId, text);
    }
  }
}
