import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { Order } from '../entities/order.entity';
import { Plan } from '../../plan/entities/plan.entity';
import { OrderStatus } from '../../../common/enums';
import { BotService } from '../../bot/bot.service';

interface PlanStat {
  planName: string;
  count: number;
  total: number;
}

@Injectable()
export class DailyReportService {
  private readonly logger = new Logger(DailyReportService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly botService: BotService,
  ) {}

  /**
   * Runs at 20:25 UTC = 23:55 Iran time (UTC+3:30).
   * Counts today's approved paid orders grouped by plan and sends a report
   * to ADMIN_GROUP_ID.
   */
  @Cron('25 20 * * *', { timeZone: 'UTC' })
  async sendDailyReport(): Promise<void> {
    const adminGroupId = process.env.ADMIN_GROUP_ID;
    if (!adminGroupId) {
      this.logger.warn('ADMIN_GROUP_ID not set — skipping daily report');
      return;
    }

    try {
      const stats = await this.getTodayStats();
      const message = this.buildMessage(stats);
      await this.botService.bot.sendMessage(adminGroupId, message, { parse_mode: 'HTML' });
      this.logger.log('Daily report sent');
    } catch (err) {
      this.logger.error(`Daily report failed: ${err.message}`);
    }
  }

  private async getTodayStats(): Promise<PlanStat[]> {
    // "Today" in Iran time: UTC+3:30 means Iran midnight = 20:30 UTC previous day
    const now = new Date();
    // Start of today in Iran: subtract 3h30m from current UTC, floor to midnight, add back 3h30m
    const iranOffsetMs = (3 * 60 + 30) * 60 * 1000;
    const iranNow = new Date(now.getTime() + iranOffsetMs);
    const iranMidnight = new Date(
      Date.UTC(iranNow.getUTCFullYear(), iranNow.getUTCMonth(), iranNow.getUTCDate()),
    );
    const startUtc = new Date(iranMidnight.getTime() - iranOffsetMs);
    const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

    const rows = await this.dataSource
      .getRepository(Order)
      .createQueryBuilder('o')
      .innerJoin(Plan, 'p', 'p.id = o.plan_id')
      .select('p.name', 'planName')
      .addSelect('COUNT(o.id)', 'count')
      .addSelect('SUM(o.amount)', 'total')
      .where('o.status = :status', { status: OrderStatus.APPROVED })
      .andWhere('o.amount > 0')           // exclude free gift orders
      .andWhere('o.approved_at >= :start', { start: startUtc })
      .andWhere('o.approved_at < :end', { end: endUtc })
      .groupBy('p.name')
      .orderBy('SUM(o.amount)', 'DESC')
      .getRawMany();

    return rows.map((r) => ({
      planName: r.planName,
      count: Number(r.count),
      total: Number(r.total),
    }));
  }

  private buildMessage(stats: PlanStat[]): string {
    // Iran date string for the report header
    const iranOffsetMs = (3 * 60 + 30) * 60 * 1000;
    const iranNow = new Date(Date.now() + iranOffsetMs);
    const dateStr = iranNow.toISOString().slice(0, 10); // YYYY-MM-DD

    if (!stats.length) {
      return `📊 <b>گزارش فروش روزانه</b>\n📅 ${dateStr}\n\n⚠️ هیچ سفارش تاییدشده‌ای امروز ثبت نشد.`;
    }

    const lines = stats.map(
      (s, i) =>
        `${i + 1}. 📦 <b>${s.planName}</b>\n` +
        `   • تعداد فروش: ${s.count} عدد\n` +
        `   • جمع فروش: ${s.total.toLocaleString('en-US')} تومان`,
    );

    const grandTotal = stats.reduce((sum, s) => sum + s.total, 0);
    const totalCount = stats.reduce((sum, s) => sum + s.count, 0);

    return (
      `📊 <b>گزارش فروش روزانه</b>\n` +
      `📅 تاریخ: ${dateStr}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      lines.join('\n\n') +
      `\n\n━━━━━━━━━━━━━━━━━━━━\n` +
      `🧾 <b>جمع کل:</b> ${totalCount} سفارش\n` +
      `💰 <b>مجموع فروش:</b> ${grandTotal.toLocaleString('en-US')} تومان`
    );
  }
}
