import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PlanRepository } from '../repositories/plan.repository';
import { CacheService } from '../../cache/cache.service';
import { Plan } from '../entities/plan.entity';
import { BandwidthUnit } from '../../../common/enums';
import { CreatePlanDto, UpdatePlanDto } from '../dto';

@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    private readonly planRepository: PlanRepository,
    private readonly cacheService: CacheService,
    private readonly dataSource: DataSource,
  ) {}

  findAll(): Promise<Plan[]> {
    return this.planRepository.findAll();
  }

  findById(id: number): Promise<Plan | null> {
    return this.planRepository.findById(id);
  }

  findDiscounted(): Promise<Plan[]> {
    return this.planRepository.findDiscounted();
  }

  async findActiveCached(): Promise<Plan[]> {
    const cached = await this.cacheService.getPlans();
    if (cached) return cached;
    const plans = await this.planRepository.findActive();
    await this.cacheService.setPlans(plans);
    return plans;
  }

  async create(dto: CreatePlanDto): Promise<Plan> {
    const plan = this.planRepository.create({ ...dto, stock: 0, is_active: dto.is_active ?? true });
    const saved = await this.planRepository.save(plan);
    await this.cacheService.invalidatePlans();
    return saved;
  }

  async update(id: number, dto: UpdatePlanDto): Promise<Plan> {
    const plan = await this.planRepository.findById(id);
    if (!plan) throw new Error('Plan not found');
    Object.assign(plan, dto);
    const saved = await this.planRepository.save(plan);
    await this.cacheService.invalidatePlans();
    return saved;
  }

  async toggleStatus(id: number): Promise<Plan> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const plan = await queryRunner.manager.findOne(Plan, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!plan) throw new Error('Plan not found');
      plan.is_active = !plan.is_active;
      const saved = await queryRunner.manager.save(plan);
      await queryRunner.commitTransaction();
      await this.cacheService.invalidatePlans();
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async delete(id: number): Promise<void> {
    const configCount = await this.planRepository.countConfigs(id);
    if (configCount > 0) throw new Error(`Cannot delete plan: ${configCount} configs still attached`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.delete(Plan, id);
      await queryRunner.commitTransaction();
      await this.cacheService.invalidatePlans();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async enableDiscount(id: number, discountedPrice: number): Promise<Plan> {
    const plan = await this.planRepository.findById(id);
    if (!plan) throw new Error('Plan not found');
    plan.has_discount = true;
    plan.discounted_price = discountedPrice;
    const saved = await this.planRepository.save(plan);
    await this.cacheService.invalidatePlans();
    return saved;
  }

  async disableDiscount(id: number): Promise<Plan> {
    const plan = await this.planRepository.findById(id);
    if (!plan) throw new Error('Plan not found');
    plan.has_discount = false;
    plan.discounted_price = null;
    const saved = await this.planRepository.save(plan);
    await this.cacheService.invalidatePlans();
    return saved;
  }

  async disableAllDiscounts(): Promise<void> {
    await this.planRepository.disableAllDiscounts();
    await this.cacheService.invalidatePlans();
  }

  getEffectivePrice(plan: Plan): number {
    return plan.has_discount && plan.discounted_price ? plan.discounted_price : plan.price;
  }

  getBandwidthText(plan: Plan): string {
    if (plan.bandwidth_value === 0) return '♾️ نامحدود';
    const labels: Record<BandwidthUnit, string> = {
      [BandwidthUnit.GB]: 'گیگابایت',
      [BandwidthUnit.MB]: 'مگابایت',
      [BandwidthUnit.TB]: 'ترابایت',
    };
    return `${plan.bandwidth_value.toLocaleString()} ${labels[plan.bandwidth_unit] ?? plan.bandwidth_unit}`;
  }

  formatAdminMessage(plan: Plan): string {
    const status    = plan.is_active ? '✅ فعال' : '❌ غیرفعال';
    const discount  = plan.has_discount && plan.discounted_price
      ? `\n💰 قیمت با تخفیف: ${plan.discounted_price.toLocaleString()} تومان`
      : '';
    const stockText = plan.stock === 0 ? 'اتمام موجودی' : `${plan.stock} عدد باقی مانده`;

    return (
      `📦 **پلن #${plan.id}**\n` +
      `📌 نام: ${plan.name}\n` +
      `📝 توضیحات: ${plan.description}\n` +
      `💰 قیمت اصلی: ${plan.price.toLocaleString()} تومان${discount}\n` +
      `⏱ مدت: ${plan.duration_days} روز\n` +
      `📊 حجم: ${this.getBandwidthText(plan)}\n` +
      `📦 موجودی: ${stockText}\n` +
      `📊 وضعیت: ${status}`
    );
  }
}
