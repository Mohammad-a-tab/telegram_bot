import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigRepository } from '../../config/repositories/config.repository';
import { PlanRepository } from '../../plan/repositories/plan.repository';
import { CacheService } from '../../cache/cache.service';
import { Config } from '../../config/entities/config.entity';
import { Plan } from '../../plan/entities/plan.entity';
import { CacheTtl } from '../../../common/enums';
import { AddConfigsDto } from '../dto';

export interface AddConfigsResult {
  added: number;
  duplicates: string[];
  failed: string[];
}

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    private readonly configRepository: ConfigRepository,
    private readonly planRepository: PlanRepository,
    private readonly cacheService: CacheService,
    private readonly dataSource: DataSource,
  ) {}

  async addConfigs(dto: AddConfigsDto): Promise<AddConfigsResult> {
    const { planId, input } = dto;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const added: Config[] = [];
    const failed: string[]     = [];
    const duplicates: string[] = [];

    try {
      const plan = await queryRunner.manager.findOne(Plan, {
        where: { id: planId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!plan) throw new Error(`Plan ${planId} not found`);

      const links = this.extractLinks(input);
      if (links.length === 0) throw new Error('No valid links found');

      const existing = await queryRunner.manager.find(Config, {
        where: { plan_id: planId },
        select: ['config_link'],
      });
      const existingSet = new Set(existing.map((c) => c.config_link));

      for (const link of links) {
        const token = this.extractToken(link);
        if (existingSet.has(token)) { duplicates.push(link); continue; }

        try {
          const config = queryRunner.manager.create(Config, {
            plan_id: planId,
            config_link: token,
            is_sold_out: false,
          });
          await queryRunner.manager.save(config);
          added.push(config);
          existingSet.add(token);
        } catch {
          failed.push(link);
        }
      }

      if (added.length > 0) {
        plan.stock = (plan.stock ?? 0) + added.length;
        await queryRunner.manager.save(plan);
      }

      await queryRunner.commitTransaction();
      await this.invalidateStockCache(planId);
      return { added: added.length, duplicates, failed };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new Error(`Failed to add configs: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async reserveConfig(planId: number): Promise<Config | null> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const config = await queryRunner.manager.findOne(Config, {
        where: { plan_id: planId, is_sold_out: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!config) { await queryRunner.rollbackTransaction(); return null; }

      const plan = await queryRunner.manager.findOne(Plan, {
        where: { id: planId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!plan || plan.stock <= 0) { await queryRunner.rollbackTransaction(); return null; }

      config.is_sold_out = true;
      plan.stock -= 1;

      await queryRunner.manager.save(config);
      await queryRunner.manager.save(plan);
      await queryRunner.commitTransaction();
      await this.invalidateStockCache(planId);
      return config;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to reserve config for plan ${planId}: ${error.message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async canPurchase(planId: number): Promise<boolean> {
    const cached = await this.cacheService.get<boolean>(`can_purchase_${planId}`);
    if (cached !== null && cached !== undefined) return cached;

    const remaining = await this.getRemainingStock(planId);
    const result = remaining > 0;
    await this.cacheService.set(`can_purchase_${planId}`, result, CacheTtl.ONE_MINUTE);
    return result;
  }

  async getRemainingStock(planId: number): Promise<number> {
    const cached = await this.cacheService.get<number>(`remaining_stock_${planId}`);
    if (cached !== null && cached !== undefined) return cached;

    const count = await this.configRepository.countAvailableByPlan(planId);
    await this.cacheService.set(`remaining_stock_${planId}`, count, CacheTtl.ONE_MINUTE);
    return count;
  }

  async deleteConfig(configId: number): Promise<void> {
    const config = await this.configRepository.findByIdWithPlan(configId);
    if (!config) throw new Error('Config not found');

    const wasSoldOut = config.is_sold_out;
    await this.configRepository.delete(configId);

    if (config.plan && !wasSoldOut) {
      config.plan.stock = Math.max(0, (config.plan.stock ?? 0) - 1);
      await this.planRepository.save(config.plan);
    }

    await this.invalidateStockCache(config.plan_id);
  }

  async invalidateStockCache(planId: number): Promise<void> {
    await Promise.all([
      this.cacheService.del(`available_config_${planId}`),
      this.cacheService.del(`can_purchase_${planId}`),
      this.cacheService.del(`remaining_stock_${planId}`),
    ]);
  }

  private readonly VPN_PROTOCOLS = ['vless://', 'vmess://', 'trojan://', 'ss://', 'ssr://'];
  private readonly HTTP_PROTOCOLS = ['https://', 'http://'];

  private extractLinks(input: string): string[] {
    const links: string[] = [];
    for (const line of input.split(/\r?\n/)) {
      for (const part of line.split(',')) {
        const t = part.trim();
        if (!t) continue;
        const isVpn  = this.VPN_PROTOCOLS.some((p) => t.startsWith(p));
        const isHttp = this.HTTP_PROTOCOLS.some((p) => t.startsWith(p));
        if (isVpn || isHttp) links.push(t);
      }
    }
    return [...new Set(links)];
  }

  private extractToken(link: string): string {
    // VPN protocol links (vless://, vmess://, etc.) are stored as-is
    const isVpn = this.VPN_PROTOCOLS.some((p) => link.startsWith(p));
    if (isVpn) return link;

    // For HTTP(S) subscription links, extract the token from the path
    const patterns = [
      /\/sub\/([a-zA-Z0-9]+)(?:\?|$)/,
      /:\d+\/sub\/([a-zA-Z0-9]+)/,
      /\/sub\/([a-zA-Z0-9]+)/,
    ];
    for (const pattern of patterns) {
      const match = link.match(pattern);
      if (match) return match[1];
    }
    return link;
  }
}
