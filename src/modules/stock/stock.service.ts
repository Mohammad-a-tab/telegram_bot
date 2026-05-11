import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Config } from '../config/entities/config.entity';
import { Plan } from '../plan/entities/plan.entity';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(Config)
    private configRepository: Repository<Config>,
    @InjectRepository(Plan)
    private planRepository: Repository<Plan>,
    private dataSource: DataSource,
    private cacheService: CacheService,
  ) {}

  // استخراج توکن از لینک ساب
  private extractToken(link: string): string {
    const patterns = [
      /\/sub\/([a-zA-Z0-9]+)/,
      /:\d+\/sub\/([a-zA-Z0-9]+)/,
      /\/sub\/([a-zA-Z0-9]+)(?:\?|$)/,
    ];
    
    for (const pattern of patterns) {
      const match = link.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return link;
  }

  async addConfigs(planId: number, input: string): Promise<{ added: number; failed: string[]; duplicates: string[] }> {
    console.log('=========================================');
    console.log('🔧 StockService.addConfigs called');
    console.log(`📦 planId: ${planId}`);
    console.log(`📝 input: ${input.substring(0, 200)}...`);
    
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
  
    const added: Config[] = [];
    const failed: string[] = [];
    const duplicates: string[] = [];
  
    try {
      // بررسی وجود پلن
      console.log('🔍 Checking if plan exists...');
      const plan = await queryRunner.manager.findOne(Plan, {
        where: { id: planId },
        lock: { mode: 'pessimistic_write' }
      });
      
      if (!plan) {
        console.log('❌ Plan not found!');
        throw new Error(`پلن با آیدی ${planId} یافت نشد`);
      }
      console.log(`✅ Plan found: ${plan.name}`);
  
      // استخراج لینک‌ها از ورودی
      console.log('🔍 Extracting links from input...');
      const lines = input.split(/\r?\n/);
      const configLinks: string[] = [];
  
      for (const line of lines) {
        const parts = line.split(/[,\s]+/);
        for (const part of parts) {
          const trimmed = part.trim();
          if (trimmed && (trimmed.startsWith('https://') || trimmed.startsWith('http://'))) {
            configLinks.push(trimmed);
          }
        }
      }
  
      console.log(`📊 Extracted ${configLinks.length} links:`);
      for (let i = 0; i < Math.min(configLinks.length, 5); i++) {
        console.log(`   ${i + 1}. ${configLinks[i]}`);
      }
      if (configLinks.length > 5) {
        console.log(`   ... and ${configLinks.length - 5} more`);
      }
  
      if (configLinks.length === 0) {
        console.log('❌ No valid links found!');
        throw new Error('هیچ لینک معتبری یافت نشد');
      }
  
      // گرفتن لینک‌های موجود
      console.log('🔍 Checking existing configs...');
      const existingConfigs = await queryRunner.manager.find(Config, {
        where: { plan_id: planId },
        select: ['config_link'],
      });
      const existingLinks = new Set(existingConfigs.map(c => c.config_link));
      console.log(`📊 Existing configs count: ${existingLinks.size}`);
  
      // پردازش هر لینک
      console.log('🔄 Processing each link...');
      for (const link of configLinks) {
        const token = this.extractToken(link);
        console.log(`   Processing: ${link.substring(0, 50)}... -> token: ${token}`);
        
        if (existingLinks.has(token)) {
          duplicates.push(link);
          console.log(`   ⚠️ Duplicate detected: ${token}`);
          continue;
        }
  
        try {
          const newConfig = queryRunner.manager.create(Config, {
            plan_id: planId,
            config_link: token,
            is_sold_out: false,
          });
          
          const saved = await queryRunner.manager.save(newConfig);
          added.push(newConfig);
          existingLinks.add(token);
          console.log(`   ✅ Added config with id: ${saved.id}`);
        } catch (err) {
          failed.push(link);
          console.error(`   ❌ Failed to add: ${link}`, err.message);
        }
      }
      
      // افزایش موجودی پلن
      if (added.length > 0) {
        console.log(`📊 Updating plan stock... +${added.length}`);
        plan.stock = (plan.stock || 0) + added.length;
        await queryRunner.manager.save(plan);
        console.log(`📊 New stock: ${plan.stock}`);
      }
  
      await queryRunner.commitTransaction();
      console.log('✅ Transaction committed successfully');
      
      // پاک کردن کش
      console.log('🗑️ Clearing cache...');
      await this.cacheService.del(`available_config_${planId}`);
      await this.cacheService.del(`can_purchase_${planId}`);
      await this.cacheService.del(`remaining_stock_${planId}`);
      
      console.log(`📊 Final result: added=${added.length}, duplicates=${duplicates.length}, failed=${failed.length}`);
      console.log('=========================================');
      
      return { added: added.length, failed, duplicates };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('❌ Transaction failed, rolling back...');
      console.error('❌ Error:', error.message);
      console.error('❌ Stack:', error.stack);
      console.log('=========================================');
      throw new Error(`خطا در افزودن کانفیگ‌ها: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }


  async getAvailableConfig(planId: number): Promise<Config | null> {
    const cached = await this.cacheService.get<Config>(`available_config_${planId}`);
    if (cached) return cached;

    const config = await this.configRepository.findOne({
      where: { plan_id: planId, is_sold_out: false },
    });

    if (config) {
      await this.cacheService.set(`available_config_${planId}`, config, 60);
    }
    return config;
  }

  async canPurchase(planId: number): Promise<boolean> {
    const cached = await this.cacheService.get<boolean>(`can_purchase_${planId}`);

    if (cached !== undefined && cached !== null) {
      return cached;
    }
    
    const remaining = await this.getRemainingStock(planId);
    const canPurchase = remaining > 0;
    
    await this.cacheService.set(`can_purchase_${planId}`, canPurchase, 60);
    return canPurchase;
  }
  
  async getRemainingStock(planId: number): Promise<number> {    
    const cached = await this.cacheService.get<number>(`remaining_stock_${planId}`);
    if (cached !== undefined && cached !== null) {
      console.log(`📦 برگرداندن از کش: ${cached}`);
      return cached;
    }
  
    const plan = await this.planRepository.findOne({ where: { id: planId } });
    if (!plan) return 0;
    
    const soldConfigs = await this.configRepository.count({
      where: { plan_id: planId, is_sold_out: true },
    });
    
    const remaining = (plan.stock || 0) - soldConfigs;
    console.log(`📊 پلن ${planId}: stock=${plan.stock}, sold=${soldConfigs}, remaining=${remaining}`);
    
    await this.cacheService.set(`remaining_stock_${planId}`, remaining, 60);
    return remaining;
  }

  async reserveConfig(planId: number): Promise<Config | null> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
  
    try {
      const config = await queryRunner.manager.findOne(Config, {
        where: { plan_id: planId, is_sold_out: false },
        lock: { mode: 'pessimistic_write' }
      });
  
      if (!config) {
        await queryRunner.rollbackTransaction();
        return null;
      }
  
      config.is_sold_out = true;
      await queryRunner.manager.save(config);
  
      const plan = await queryRunner.manager.findOne(Plan, {
        where: { id: planId },
        lock: { mode: 'pessimistic_write' }
      });
      
      if (plan) {
        const currentStock = plan.stock || 0;
        if (currentStock <= 0) {
          await queryRunner.rollbackTransaction();
          return null;
        }
        plan.stock = currentStock - 1;
        await queryRunner.manager.save(plan);
        console.log(`📊 موجودی پلن ${planId} به ${plan.stock} کاهش یافت`);
      }
  
      await queryRunner.commitTransaction();
      
      await this.cacheService.del(`available_config_${planId}`);
      await this.cacheService.del(`can_purchase_${planId}`);
      await this.cacheService.del(`remaining_stock_${planId}`);
      
      return config;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`❌ خطا در رزرو کانفیگ برای پلن ${planId}:`, error.message);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getPlanConfigsCount(planId: number): Promise<{ total: number; sold: number; remaining: number }> {
    const total = await this.configRepository.count({ where: { plan_id: planId } });
    const sold = await this.configRepository.count({ where: { plan_id: planId, is_sold_out: true } });
    
    return { total, sold, remaining: total - sold };
  }
}