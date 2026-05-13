import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Config } from '../entities/config.entity';

@Injectable()
export class ConfigRepository {
  constructor(
    @InjectRepository(Config)
    private readonly repo: Repository<Config>,
  ) {}

  findById(id: number): Promise<Config | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByIdWithPlan(id: number): Promise<Config | null> {
    return this.repo.findOne({ where: { id }, relations: ['plan'] });
  }

  findByPlan(planId: number): Promise<Config[]> {
    return this.repo.find({ where: { plan_id: planId } });
  }

  findAvailableByPlan(planId: number): Promise<Config | null> {
    return this.repo.findOne({ where: { plan_id: planId, is_sold_out: false } });
  }

  countByPlan(planId: number): Promise<number> {
    return this.repo.count({ where: { plan_id: planId } });
  }

  countAvailableByPlan(planId: number): Promise<number> {
    return this.repo.count({ where: { plan_id: planId, is_sold_out: false } });
  }

  countSoldByPlan(planId: number): Promise<number> {
    return this.repo.count({ where: { plan_id: planId, is_sold_out: true } });
  }

  findExistingLinks(planId: number): Promise<Config[]> {
    return this.repo.find({ where: { plan_id: planId }, select: ['config_link'] });
  }

  save(config: Config): Promise<Config> {
    return this.repo.save(config);
  }

  create(data: Partial<Config>): Config {
    return this.repo.create(data);
  }

  async delete(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
