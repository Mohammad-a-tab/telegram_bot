import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Plan } from './entities/plan.entity';

@Injectable()
export class PlanAdminService {
  constructor(
    @InjectRepository(Plan)
    private planRepository: Repository<Plan>,
    private dataSource: DataSource,
  ) {}

  async getAllPlans(): Promise<Plan[]> {
    return await this.planRepository.find({
      order: { id: 'ASC' },
    });
  }

  async getPlanById(id: number): Promise<Plan | null> {
    return await this.planRepository.findOne({ where: { id } });
  }

  async createPlan(data: Partial<Plan>): Promise<Plan> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    
    try {
      const validatedData = {
        name: data.name || '',
        description: data.description || '',
        price: data.price && !isNaN(data.price) ? data.price : 0,
        discounted_price: data.discounted_price && !isNaN(data.discounted_price) ? data.discounted_price : null,
        has_discount: data.has_discount || false,
        duration_days: data.duration_days && !isNaN(data.duration_days) ? data.duration_days : 0,
        bandwidth_value: data.bandwidth_value && !isNaN(data.bandwidth_value) ? data.bandwidth_value : 0,
        bandwidth_unit: data.bandwidth_unit || 'GB',
        stock: 0,
        is_active: data.is_active !== undefined ? data.is_active : true,
      };
  
      const plan = queryRunner.manager.create(Plan, validatedData);
      const savedPlan = await queryRunner.manager.save(plan);
      
      await queryRunner.commitTransaction();
      return savedPlan;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new Error(`Failed to create plan: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async updatePlan(id: number, data: Partial<Plan>): Promise<Plan | null> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    
    try {
      const plan = await queryRunner.manager.findOne(Plan, { where: { id } });
      if (!plan) {
        throw new Error('Plan not found');
      }

      if (data.name !== undefined) plan.name = data.name;
      if (data.description !== undefined) plan.description = data.description;
      
      if (data.price !== undefined) {
        const price = parseFloat(data.price as any);
        if (isNaN(price)) {
          throw new Error('قیمت وارد شده معتبر نیست');
        }
        plan.price = price;
      }
      
      if (data.discounted_price !== undefined) {
        const discountedPrice = parseFloat(data.discounted_price as any);
        if (isNaN(discountedPrice)) {
          throw new Error('قیمت تخفیف وارد شده معتبر نیست');
        }
        plan.discounted_price = discountedPrice;
        plan.has_discount = true;
      }
      
      if (data.duration_days !== undefined) {
        const days = parseInt(data.duration_days as any);
        if (isNaN(days)) {
          throw new Error('مدت اعتبار وارد شده معتبر نیست');
        }
        plan.duration_days = days;
      }
      
      if (data.bandwidth_value !== undefined) {
        const bandwidth = parseFloat(data.bandwidth_value as any);
        if (isNaN(bandwidth)) {
          throw new Error('مقدار حجم وارد شده معتبر نیست');
        }
        plan.bandwidth_value = bandwidth;
      }
      
      if (data.bandwidth_unit !== undefined) {
        plan.bandwidth_unit = data.bandwidth_unit;
      }
      
      if (data.stock !== undefined) {
        const stock = parseInt(data.stock as any);
        if (isNaN(stock)) {
          throw new Error('موجودی وارد شده معتبر نیست');
        }
        plan.stock = stock;
      }
      
      if (data.is_active !== undefined) plan.is_active = data.is_active;
  
      const savedPlan = await queryRunner.manager.save(plan);
      await queryRunner.commitTransaction();
      return savedPlan;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new Error(`Failed to update plan: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async togglePlanStatus(id: number): Promise<Plan | null> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    
    try {
      const plan = await queryRunner.manager.findOne(Plan, { where: { id } });
      if (!plan) {
        throw new Error('Plan not found');
      }
      
      plan.is_active = !plan.is_active;
      const savedPlan = await queryRunner.manager.save(plan);
      
      await queryRunner.commitTransaction();
      return savedPlan;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new Error(`Failed to toggle plan status: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async deletePlan(id: number): Promise<boolean> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    
    try {
      const result = await queryRunner.manager.delete(Plan, id);
      await queryRunner.commitTransaction();
      return result.affected > 0;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new Error(`Failed to delete plan: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  private getBandwidthText(plan: Plan): string {
    if (plan.bandwidth_value === 0) {
      return 'نامحدود';
    }
    const unit = plan.bandwidth_unit === 'GB' ? 'گیگابایت' : plan.bandwidth_unit === 'MB' ? 'مگابایت' : 'ترابایت';
    return `${plan.bandwidth_value.toLocaleString()} ${unit}`;
  }

  formatPlanMessage(plan: Plan): string {
    const status = plan.is_active ? '✅ فعال' : '❌ غیرفعال';
    const discount = plan.has_discount && plan.discounted_price 
      ? `\n💰 قیمت با تخفیف: ${plan.discounted_price.toLocaleString()} تومان` 
      : '';
    const stockText = plan.stock === -1 
      ? 'نامحدود' 
      : plan.stock === 0 
        ? 'اتمام موجودی' 
        : `${plan.stock} عدد باقی مانده`;
    const bandwidthText = this.getBandwidthText(plan);
    
    return `📦 **پلن #${plan.id}**\n` +
           `📌 نام: ${plan.name}\n` +
           `📝 توضیحات: ${plan.description}\n` +
           `💰 قیمت اصلی: ${plan.price.toLocaleString()} تومان${discount}\n` +
           `⏱ مدت: ${plan.duration_days} روز\n` +
           `📊 حجم: ${bandwidthText}\n` +
           `📦 موجودی: ${stockText}\n` +
           `📊 وضعیت: ${status}`;
  }
}