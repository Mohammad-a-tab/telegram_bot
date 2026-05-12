import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderHandler } from '../bot/handlers/order.handler';
import { PendingOrderCheckerService } from './pending-order.checker.service';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    CacheModule,
  ],
  providers: [OrderHandler, PendingOrderCheckerService],
  exports: [OrderHandler, PendingOrderCheckerService, TypeOrmModule],
})
export class OrderModule {}