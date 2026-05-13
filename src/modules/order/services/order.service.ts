import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrderRepository } from '../repositories/order.repository';
import { Order } from '../entities/order.entity';
import { Plan } from '../../plan/entities/plan.entity';
import { Config } from '../../config/entities/config.entity';
import { CacheService } from '../../cache/cache.service';
import { OrderStatus, CacheTtl } from '../../../common/enums';
import { CreateOrderDto } from '../dto';

export interface ApproveOrderResult {
  order: Order;
  config: Config;
  plan: Plan;
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly cacheService: CacheService,
    private readonly dataSource: DataSource,
  ) {}

  findById(id: number): Promise<Order | null> {
    return this.orderRepository.findById(id);
  }

  findByIdWithRelations(id: number): Promise<Order | null> {
    return this.orderRepository.findByIdWithRelations(id);
  }

  findApprovedByUser(userId: number): Promise<Order[]> {
    return this.orderRepository.findApprovedByUser(userId);
  }

  findByStatus(status: OrderStatus): Promise<Order[]> {
    return this.orderRepository.findByStatus(status);
  }

  findAll(take = 20): Promise<Order[]> {
    return this.orderRepository.findAllWithRelations(take);
  }

  findAllByStatus(status: OrderStatus, take = 20): Promise<Order[]> {
    return this.orderRepository.findAllByStatusWithRelations(status, take);
  }

  countByStatus(status: OrderStatus): Promise<number> {
    return this.orderRepository.countByStatus(status);
  }

  async hasPendingOrder(userId: number): Promise<boolean> {
    const cached = await this.cacheService.get(`pending_order_${userId}`);
    return !!cached;
  }

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const plan = await queryRunner.manager.findOne(Plan, {
        where: { id: dto.planId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!plan) throw new Error('Plan not found');

      const order = queryRunner.manager.create(Order, {
        user_id: dto.userId,
        plan_id: dto.planId,
        amount: dto.amount,
        payment_receipt_file_id: dto.paymentReceiptFileId,
        status: OrderStatus.PENDING,
      });

      const saved = await queryRunner.manager.save(order);
      await queryRunner.commitTransaction();
      await this.cacheService.set(`pending_order_${dto.userId}`, { orderId: saved.id }, CacheTtl.FIFTEEN_MINUTES);
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new Error(`Failed to create order: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async approveOrder(orderId: number): Promise<ApproveOrderResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const order = await queryRunner.manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new Error('Order not found');
      if (order.status !== OrderStatus.PENDING) throw new Error('Order already processed');

      const plan = await queryRunner.manager.findOne(Plan, {
        where: { id: order.plan_id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!plan) throw new Error('Plan not found');

      const config = await queryRunner.manager.findOne(Config, {
        where: { plan_id: plan.id, is_sold_out: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!config) throw new Error('No config available');

      config.is_sold_out = true;
      if (plan.stock > 0) plan.stock -= 1;

      order.status = OrderStatus.APPROVED;
      order.config_id = config.id;
      order.approved_at = new Date();

      await queryRunner.manager.save(config);
      await queryRunner.manager.save(plan);
      await queryRunner.manager.save(order);
      await queryRunner.commitTransaction();

      await this.cacheService.del(`pending_order_${order.user_id}`);
      return { order, config, plan };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async rejectOrder(orderId: number): Promise<Order> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const order = await queryRunner.manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new Error('Order not found');
      if (order.status !== OrderStatus.PENDING) throw new Error('Order already processed');

      order.status = OrderStatus.REJECTED;
      await queryRunner.manager.save(order);
      await queryRunner.commitTransaction();

      await this.cacheService.del(`pending_order_${order.user_id}`);
      return order;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async saveAdminMessageId(orderId: number, messageId: string): Promise<void> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) return;
    order.admin_message_id = messageId;
    await this.orderRepository.save(order);
  }
}
