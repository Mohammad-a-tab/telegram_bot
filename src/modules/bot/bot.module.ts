import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { CallbackHandler } from './handlers/callback.handler';
import { UserHandler } from './handlers/user.handler';
import { OrderHandler } from './handlers/order.handler';
import { PlanHandler } from './handlers/plan.handler';
import { ConfigHandler } from './handlers/config.handler';
import { DiscountHandler } from './handlers/discount.handler';
import { SubHandler } from './handlers/sub.handler';
import { ServiceHandler } from './handlers/service.handler';
import { BroadcastHandler } from './handlers/broadcast.handler';
import { DailyReportService } from '../order/services/daily-report.service';
import { TelegramSender } from './utils/telegram-sender';
import { MessageHelper } from './utils/message.utils';
import { AdminStateManager } from './states/admin.state';
import { UserModule } from '../user/user.module';
import { PlanModule } from '../plan/plan.module';
import { OrderModule } from '../order/order.module';
import { SubModule } from '../sub/sub.module';
import { StockModule } from '../stock/stock.module';
import { ConfigModule } from '../config/config.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ReferralModule } from '../referral/referral.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [
    UserModule,
    PlanModule,
    OrderModule,
    SubModule,
    StockModule,
    ConfigModule,
    TelegramModule,
    ReferralModule,
    CacheModule,
  ],
  providers: [
    // core
    BotService,
    AdminStateManager,
    TelegramSender,
    MessageHelper,
    // handlers
    CallbackHandler,
    UserHandler,
    OrderHandler,
    PlanHandler,
    ConfigHandler,
    DiscountHandler,
    SubHandler,
    ServiceHandler,
    BroadcastHandler,
    DailyReportService,
  ],
  exports: [BotService],
})
export class BotModule {}
