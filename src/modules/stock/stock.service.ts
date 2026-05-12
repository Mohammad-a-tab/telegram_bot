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

  async addConfigs(planId: number, input: string): Promise<{ added: number; failed: string[]; duplicates: string[] }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
  
    const added: Config[] = [];
    const failed: string[] = [];
    const duplicates: string[] = [];
  
    try {
      const plan = await queryRunner.manager.findOne(Plan, {
        where: { id: planId },
        lock: { mode: 'pessimistic_write' }
      });
      
      if (!plan) {
        throw new Error(`پلن با آیدی ${planId} یافت نشد`);
      }
  
      // استخراج لینک‌ها از ورودی
      const configLinks = this.extractLinksFromInput(input);
      
      if (configLinks.length === 0) {
        throw new Error('هیچ لینک معتبری یافت نشد');
      }
  
      // گرفتن لینک‌های موجود
      const existingConfigs = await queryRunner.manager.find(Config, {
        where: { plan_id: planId },
        select: ['config_link'],
      });
      const existingLinks = new Set(existingConfigs.map(c => c.config_link));
  
      for (const link of configLinks) {
        const token = this.extractToken(link);
        
        if (existingLinks.has(token)) {
          duplicates.push(link);
          continue;
        }
  
        try {
          const newConfig = queryRunner.manager.create(Config, {
            plan_id: planId,
            config_link: token,
            is_sold_out: false,
          });
          
          await queryRunner.manager.save(newConfig);
          added.push(newConfig);
          existingLinks.add(token);
        } catch (err) {
          failed.push(link);
        }
      }
      
      if (added.length > 0) {
        plan.stock = (plan.stock || 0) + added.length;
        await queryRunner.manager.save(plan);
      }
  
      await queryRunner.commitTransaction();
      
      await this.cacheService.del(`available_config_${planId}`);
      await this.cacheService.del(`can_purchase_${planId}`);
      await this.cacheService.del(`remaining_stock_${planId}`);
      
      return { added: added.length, failed, duplicates };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new Error(`خطا در افزودن کانفیگ‌ها: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }
  
  private extractLinksFromInput(input: string): string[] {
    const links: string[] = [];
    const lines = input.split(/\r?\n/);
    
    for (const line of lines) {
      const parts = line.split(',');
      for (const part of parts) {
        const subparts = part.split(/\s+/);
        for (const subpart of subparts) {
          const trimmed = subpart.trim();
          if (trimmed && (trimmed.startsWith('https://') || trimmed.startsWith('http://'))) {
            links.push(trimmed);
          }
        }
      }
    }
    
    return [...new Set(links)];
  }
  
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
    
    console.log(`🔍 Plan ${planId}: remaining=${remaining}, canPurchase=${canPurchase}`);
    
    await this.cacheService.set(`can_purchase_${planId}`, canPurchase, 60);
    return canPurchase;
  }
  
  async getRemainingStock(planId: number): Promise<number> {    
    const cached = await this.cacheService.get<number>(`remaining_stock_${planId}`);
    if (cached !== undefined && cached !== null) {
      console.log(`📦 returning cached: ${cached}`);
      return cached;
    }
  
    const plan = await this.planRepository.findOne({ where: { id: planId } });
    if (!plan) return 0;

    const availableConfigs = await this.configRepository.count({
      where: { plan_id: planId, is_sold_out: false },
    });

    const remaining = availableConfigs;
    
    console.log(`📊 Plan ${planId}: stock=${plan.stock}, availableConfigs=${availableConfigs}, remaining=${remaining}`);
    
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
      
      if (plan && plan.stock > 0) {
        plan.stock = plan.stock - 1;
        await queryRunner.manager.save(plan);
      } else if (plan && plan.stock === 0) {
        await queryRunner.rollbackTransaction();
        return null;
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