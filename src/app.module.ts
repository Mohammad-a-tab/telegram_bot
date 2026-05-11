import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './modules/user/entities/user.entity';
import { Plan } from './modules/plan/entities/plan.entity';
import { Order } from './modules/order/entities/order.entity';
import { Config } from './modules/config/entities/config.entity';
import { UserModule } from './modules/user/user.module';
import { PlanModule } from './modules/plan/plan.module';
import { OrderModule } from './modules/order/order.module';
import { ConfigModule as ConfigsModule } from './modules/config/config.module';
import { CacheModule } from './modules/cache/cache.module';
import { BotModule } from './modules/bot/bot.module';
import { ChannelMiddleware } from './modules/telegram/middlewares/channel.middleware';
import { AdminMiddleware } from './modules/telegram/middlewares/admin.middleware';
import { PlanAdminService } from './modules/plan/plan.admin.service';
import { Sub } from './modules/sub/entities/sub.entity';
import { SubModule } from './modules/sub/sub.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [User, Plan, Order, Config, Sub],
      synchronize: true,
      logging: false,
    }),
    TypeOrmModule.forFeature([User, Plan, Order, Config, Sub]),
    UserModule,
    PlanModule,
    OrderModule,
    ConfigsModule,
    CacheModule,
    BotModule,
    SubModule
  ],
  providers: [ChannelMiddleware, AdminMiddleware, PlanAdminService],
  exports: [ChannelMiddleware, AdminMiddleware, PlanAdminService],
})
export class AppModule {}