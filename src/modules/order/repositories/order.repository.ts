import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../entities/order.entity';

@Injectable()
export class OrderRepository {
  constructor(
    @InjectRepository(Order)
    private readonly repo: Repository<Order>,
  ) {}

  findById(id: number): Promise<Order | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByIdWithRelations(id: number): Promise<Order | null> {
    return this.repo.findOne({ where: { id }, relations: ['plan', 'user', 'config'] });
  }

  findByUserAndStatus(userId: number, status: OrderStatus): Promise<Order[]> {
    return this.repo.find({
      where: { user_id: userId, status },
      order: { created_at: 'DESC' },
    });
  }

  findByStatus(status: OrderStatus): Promise<Order[]> {
    return this.repo.find({
      where: { status },
      relations: ['plan', 'user'],
      order: { created_at: 'DESC' },
    });
  }

  findAllWithRelations(take = 20): Promise<Order[]> {
    return this.repo.find({
      relations: ['plan', 'user'],
      order: { created_at: 'DESC' },
      take,
    });
  }

  findAllByStatusWithRelations(status: OrderStatus, take = 20): Promise<Order[]> {
    return this.repo.find({
      where: { status },
      relations: ['plan', 'user'],
      order: { created_at: 'DESC' },
      take,
    });
  }

  countByStatus(status: OrderStatus): Promise<number> {
    return this.repo.count({ where: { status } });
  }

  save(order: Order): Promise<Order> {
    return this.repo.save(order);
  }

  create(data: Partial<Order>): Order {
    return this.repo.create(data);
  }

  findPendingByUser(userId: number): Promise<Order | null> {
    return this.repo.findOne({ where: { user_id: userId, status: OrderStatus.PENDING } });
  }

  findApprovedByUser(userId: number): Promise<Order[]> {
    return this.repo.find({
      where: { user_id: userId, status: OrderStatus.APPROVED },
      order: { created_at: 'DESC' },
    });
  }

  findByConfigAndStatus(configId: number, status: OrderStatus): Promise<Order | null> {
    return this.repo.findOne({ where: { config_id: configId, status }, relations: ['user'] });
  }
}
