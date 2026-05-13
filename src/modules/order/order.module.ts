import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderRepository } from './repositories';
import { OrderService, PendingOrderCheckerService } from './services';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [TypeOrmModule.forFeature([Order]), CacheModule],
  providers: [OrderRepository, OrderService, PendingOrderCheckerService],
  exports: [OrderRepository, OrderService, PendingOrderCheckerService],
})
export class OrderModule {}
