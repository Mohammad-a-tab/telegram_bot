import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from '../plan/entities/plan.entity';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class StockCheckerService {
  private readonly LOW_STOCK_THRESHOLD = 3;
  private readonly CHECK_INTERVAL = 15 * 60 * 1000;

  constructor(
    @InjectRepository(Plan)
    private planRepository: Repository<Plan>,
    private cacheService: CacheService,
  ) {}

  async startChecking(bot: any, adminGroupId: string) {
    console.log('📊 Stock checker started - checking every 15 minutes');    
    await this.checkAndNotify(bot, adminGroupId);

    setInterval(async () => {
      await this.checkAndNotify(bot, adminGroupId);
    }, this.CHECK_INTERVAL);
  }

  async checkAndNotify(bot: any, adminGroupId: string) {
    try {
      const plans = await this.planRepository.find({
        where: { is_active: true },
        select: ['id', 'name', 'stock'],
      });

      let hasLowStock = false;
      let message = `📊 **گزارش دوره‌ای موجودی پلن‌ها**\n\n`;

      for (const plan of plans) {
        const remainingStock = await this.getRemainingStock(plan.id);
        const status = remainingStock <= this.LOW_STOCK_THRESHOLD ? '⚠️' : '✅';
        
        message += `${status} پلن: ${plan.name}\n`;
        message += `   موجودی قابل فروش: ${remainingStock} عدد\n`;
        
        if (remainingStock <= this.LOW_STOCK_THRESHOLD && remainingStock > 0) {
          hasLowStock = true;
          message += `   🔴 **کمبود موجودی!** لطفاً هرچه سریعتر کانفیگ اضافه کنید.\n`;
        } else if (remainingStock === 0) {
          hasLowStock = true;
          message += `   🚨 **اتمام موجودی!** امکان فروش وجود ندارد.\n`;
        }
        message += `\n`;
      }

      if (hasLowStock && adminGroupId) {
        await bot.sendMessage(adminGroupId, message, { parse_mode: 'Markdown' });
        
        await this.cacheService.set('last_low_stock_notification', Date.now(), 900);
      }
    } catch (error) {
      console.error('Error in stock checker:', error);
      if (adminGroupId) {
        await bot.sendMessage(adminGroupId, `❌ خطا در بررسی خودکار موجودی: ${error.message}`);
      }
    }
  }

  async getRemainingStock(planId: number): Promise<number> {
    const plan = await this.planRepository.findOne({ where: { id: planId } });
    if (!plan) return 0;
    
    const configRepository = this.planRepository.manager.getRepository('configs');
    const soldConfigs = await configRepository.count({
      where: { plan_id: planId, is_sold_out: true },
    });
    
    const result = plan.stock - soldConfigs;
    return result < 0 ? 0 : result;
  }
}