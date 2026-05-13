import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { User } from './modules/user/entities/user.entity';
import { Plan } from './modules/plan/entities/plan.entity';
import { Order } from './modules/order/entities/order.entity';
import { Config } from './modules/config/entities/config.entity';
import { Sub } from './modules/sub/entities/sub.entity';
import { Referral } from './modules/referral/entities/referral.entity';
import { BotModule } from './modules/bot/bot.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [User, Plan, Order, Config, Sub, Referral],
      synchronize: true,
      logging: false,
    }),
    BotModule,
  ],
})
export class AppModule {}