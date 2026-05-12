import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { PendingOrderCheckerService } from './pending-order.checker.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order])],
  controllers: [],
  providers: [PendingOrderCheckerService],
  exports: [PendingOrderCheckerService, TypeOrmModule],
})
export class OrderModule {}