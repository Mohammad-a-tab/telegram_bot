import { Injectable } from '@nestjs/common';
import { ConfigRepository } from '../repositories/config.repository';
import { OrderRepository } from '../../order/repositories/order.repository';
import { Config } from '../entities/config.entity';
import { OrderStatus } from '../../order/entities/order.entity';

@Injectable()
export class ConfigService {
  constructor(
    private readonly configRepository: ConfigRepository,
    private readonly orderRepository: OrderRepository,
  ) {}

  findById(id: number): Promise<Config | null> {
    return this.configRepository.findById(id);
  }

  findByPlan(planId: number): Promise<Config[]> {
    return this.configRepository.findByPlan(planId);
  }

  findByPlanAndStatus(planId: number, isSoldOut: boolean): Promise<Config[]> {
    return this.configRepository.findByPlanAndStatus(planId, isSoldOut);
  }

  countByPlan(planId: number): Promise<number> {
    return this.configRepository.countByPlan(planId);
  }

  async getBuyerForConfig(configId: number): Promise<string | null> {
    const order = await this.orderRepository.findByConfigAndStatus(configId, OrderStatus.APPROVED);
    if (!order?.user) return null;
    return order.user.username ? `@${order.user.username}` : order.user.first_name;
  }
}
