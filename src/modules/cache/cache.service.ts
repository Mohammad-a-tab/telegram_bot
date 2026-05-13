import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CacheTtl } from '../../common/enums';

@Injectable()
export class CacheService {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  get<T>(key: string): Promise<T | null> {
    return this.cacheManager.get<T>(key);
  }

  async set(key: string, value: any, ttl: CacheTtl | number = 0): Promise<void> {
    ttl === 0
      ? await this.cacheManager.set(key, value)
      : await this.cacheManager.set(key, value, ttl);
  }

  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  async getPlans(): Promise<any[] | null> {
    return this.get<any[]>('plans_list');
  }

  async setPlans(plans: any[]): Promise<void> {
    await this.set('plans_list', plans, CacheTtl.FIVE_MINUTES);
  }

  async invalidatePlans(): Promise<void> {
    await this.del('plans_list');
  }
}
