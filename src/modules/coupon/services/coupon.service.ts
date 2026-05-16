import { Injectable } from '@nestjs/common';
import { CouponRepository } from '../repositories/coupon.repository';
import { DiscountCode } from '../entities/coupon.entity';

export interface ValidateCouponResult {
  valid: boolean;
  coupon?: DiscountCode;
  reason?: string;
}

@Injectable()
export class CouponService {
  constructor(private readonly repo: CouponRepository) {}

  /** Generate a random 8-char uppercase alphanumeric code */
  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  async create(opts: {
    percent: number;
    maxUses: number;
    restrictedUserId?: number | null;
    planIds?: number[] | null;
  }): Promise<DiscountCode> {
    let code: string;
    // ensure uniqueness
    do {
      code = this.generateCode();
    } while (await this.repo.findByCode(code));

    return this.repo.save({
      code,
      percent: opts.percent,
      max_uses: opts.maxUses,
      restricted_user_id: opts.restrictedUserId ?? null,
      plan_ids: opts.planIds?.length ? opts.planIds.join(',') : null,
      is_active: true,
      used_count: 0,
    });
  }

  findAll(): Promise<DiscountCode[]> {
    return this.repo.findAll();
  }

  findById(id: number): Promise<DiscountCode | null> {
    return this.repo.findById(id);
  }

  async toggle(id: number): Promise<DiscountCode> {
    const coupon = await this.repo.findById(id);
    if (!coupon) throw new Error('کد تخفیف یافت نشد.');
    coupon.is_active = !coupon.is_active;
    return this.repo.save(coupon);
  }

  async delete(id: number): Promise<void> {
    return this.repo.delete(id);
  }

  async validate(code: string, userId: number, planId: number): Promise<ValidateCouponResult> {
    const coupon = await this.repo.findByCode(code);
    if (!coupon) return { valid: false, reason: '❌ کد تخفیف وارد شده معتبر نیست.' };
    if (!coupon.is_active) return { valid: false, reason: '❌ این کد تخفیف غیرفعال شده است.' };
    if (!coupon.hasUsesLeft) return { valid: false, reason: '❌ ظرفیت استفاده از این کد تخفیف تمام شده است.' };
    if (!coupon.isValidForUser(userId)) return { valid: false, reason: '❌ این کد تخفیف برای حساب شما معتبر نیست.' };
    if (!coupon.isValidForPlan(planId)) return { valid: false, reason: '❌ این کد تخفیف برای پلن انتخابی شما قابل استفاده نیست.' };
    return { valid: true, coupon };
  }

  async markUsed(id: number): Promise<void> {
    return this.repo.incrementUsed(id);
  }

  applyDiscount(originalPrice: number, percent: number): number {
    return Math.round(originalPrice * (1 - percent / 100));
  }
}
