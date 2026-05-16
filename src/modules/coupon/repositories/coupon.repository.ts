import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiscountCode } from '../entities/coupon.entity';

@Injectable()
export class CouponRepository {
  constructor(
    @InjectRepository(DiscountCode)
    private readonly repo: Repository<DiscountCode>,
  ) {}

  save(entity: Partial<DiscountCode>): Promise<DiscountCode> {
    return this.repo.save(entity);
  }

  findByCode(code: string): Promise<DiscountCode | null> {
    return this.repo.findOne({ where: { code: code.toUpperCase() } });
  }

  findAll(): Promise<DiscountCode[]> {
    return this.repo.find({ order: { created_at: 'DESC' } });
  }

  findById(id: number): Promise<DiscountCode | null> {
    return this.repo.findOne({ where: { id } });
  }

  async incrementUsed(id: number): Promise<void> {
    await this.repo.increment({ id }, 'used_count', 1);
  }

  async delete(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}
