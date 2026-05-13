import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from '../entities/plan.entity';
import { Config } from '../../config/entities/config.entity';

@Injectable()
export class PlanRepository {
  constructor(
    @InjectRepository(Plan)
    private readonly repo: Repository<Plan>,
  ) {}

  findAll(): Promise<Plan[]> {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  findActive(): Promise<Plan[]> {
    return this.repo.find({ where: { is_active: true }, order: { price: 'ASC' } });
  }

  findById(id: number): Promise<Plan | null> {
    return this.repo.findOne({ where: { id } });
  }

  findDiscounted(): Promise<Plan[]> {
    return this.repo.find({ where: { has_discount: true, is_active: true } });
  }

  save(plan: Plan): Promise<Plan> {
    return this.repo.save(plan);
  }

  create(data: Partial<Plan>): Plan {
    return this.repo.create(data);
  }

  async delete(id: number): Promise<void> {
    await this.repo.delete(id);
  }

  async disableAllDiscounts(): Promise<void> {
    await this.repo.update({ has_discount: true }, { has_discount: false, discounted_price: null });
  }

  async incrementStock(id: number, amount: number): Promise<void> {
    await this.repo.increment({ id }, 'stock', amount);
  }

  async decrementStock(id: number): Promise<void> {
    await this.repo.decrement({ id }, 'stock', 1);
  }

  /** Fix: use typed Config entity instead of magic string 'configs' */
  countConfigs(planId: number): Promise<number> {
    return this.repo.manager.getRepository(Config).count({ where: { plan_id: planId } });
  }
}
