import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { Plan } from '../plan/entities/plan.entity';
import { Order } from '../order/entities/order.entity';
import { Config } from '../config/entities/config.entity';
import { CacheModule } from '../cache/cache.module';
import { CacheService } from '../cache/cache.service';
import { ChannelMiddleware } from '../telegram/middlewares/channel.middleware';
import { AdminMiddleware } from '../telegram/middlewares/admin.middleware';
import { PlanAdminService } from '../plan/plan.admin.service';
import { StockService } from '../stock/stock.service';
import { BotService } from './bot.service';
import { SubService } from '../sub/sub.service';
import { StockCheckerService } from '../stock/stock.checker.service';
import { Sub } from '../sub/entities/sub.entity';
import { SubModule } from '../sub/sub.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Plan, Order, Config, Sub]),
    CacheModule,
    SubModule
  ],
  providers: [
    BotService,
    CacheService,
    ChannelMiddleware,
    AdminMiddleware,
    PlanAdminService,
    StockService,
    SubService,
    StockCheckerService
  ],
  exports: [BotService],
})
export class BotModule {}