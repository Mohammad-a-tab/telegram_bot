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
        bandwidth_gb: data.bandwidth_gb && !isNaN(data.bandwidth_gb) ? data.bandwidth_gb : 0,
        stock: 0,  // موجودی اولیه صفر
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
      if (data.price !== undefined && !isNaN(data.price)) plan.price = data.price;
      if (data.discounted_price !== undefined && !isNaN(data.discounted_price)) {
        plan.discounted_price = data.discounted_price;
        plan.has_discount = true;
      }
      if (data.duration_days !== undefined && !isNaN(data.duration_days)) plan.duration_days = data.duration_days;
      if (data.bandwidth_gb !== undefined && !isNaN(data.bandwidth_gb)) plan.bandwidth_gb = data.bandwidth_gb;
      if (data.stock !== undefined && !isNaN(data.stock)) plan.stock = data.stock;
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
    
    return `📦 **پلن #${plan.id}**\n` +
           `📌 نام: ${plan.name}\n` +
           `📝 توضیحات: ${plan.description}\n` +
           `💰 قیمت اصلی: ${plan.price.toLocaleString()} تومان${discount}\n` +
           `⏱ مدت: ${plan.duration_days} روز\n` +
           `📊 حجم: ${plan.bandwidth_gb === 0 ? 'نامحدود' : plan.bandwidth_gb + ' گیگابایت'}\n` +
           `📦 موجودی: ${stockText}\n` +
           `📊 وضعیت: ${status}`;
  }
}