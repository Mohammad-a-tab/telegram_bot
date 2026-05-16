import { Injectable, Logger } from '@nestjs/common';
import { PlanRepository } from '../../plan/repositories/plan.repository';
import { StockService } from './stock.service';
import { StockThreshold, StockCheckInterval } from '../../../common/enums';

@Injectable()
export class StockCheckerService {
  private readonly logger = new Logger(StockCheckerService.name);

  constructor(
    private readonly planRepository: PlanRepository,
    private readonly stockService: StockService,
  ) {}

  startChecking(bot: any, reportsChannelId: string): void {
    this.logger.log('Stock checker started — interval: 55 minutes');
    this.checkAndNotify(bot, reportsChannelId);
    setInterval(() => this.checkAndNotify(bot, reportsChannelId), StockCheckInterval.STOCK_CHECKER_MS);
  }

  async checkAndNotify(bot: any, reportsChannelId: string): Promise<void> {
    try {
      const plans = await this.planRepository.findActive();

      let hasLowStock = false;
      let message = `📊 **گزارش دوره‌ای موجودی پلن‌ها**\n\n`;

      for (const plan of plans) {
        const remaining = await this.stockService.getRemainingStock(plan.id);
        const isEmpty   = remaining === StockThreshold.ZERO;
        const isLow     = remaining <= StockThreshold.LOW;
        const icon      = isLow ? '⚠️' : '✅';

        message += `${icon} پلن: ${plan.name}\n   موجودی: ${remaining} عدد\n`;

        if (isEmpty) {
          hasLowStock = true;
          message += `   🚨 **اتمام موجودی!**\n`;
        } else if (isLow) {
          hasLowStock = true;
          message += `   🔴 **کمبود موجودی!**\n`;
        }

        message += '\n';
      }

      if (hasLowStock && reportsChannelId) {
        await bot.sendMessage(reportsChannelId, message, { parse_mode: 'Markdown' });
      }
    } catch (error) {
      this.logger.error(`Stock check failed: ${error.message}`);
      if (reportsChannelId) {
        await bot.sendMessage(reportsChannelId, `❌ خطا در بررسی موجودی: ${error.message}`);
      }
    }
  }
}
