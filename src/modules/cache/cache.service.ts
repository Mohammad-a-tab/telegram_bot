import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async get<T>(key: string): Promise<T | null> {
    return await this.cacheManager.get<T>(key);
  }

  async set(key: string, value: any, ttl: number = 0): Promise<void> {
    if (ttl === 0) {
      await this.cacheManager.set(key, value);
    } else {
      await this.cacheManager.set(key, value, ttl);
    }
  }

  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  async getPlans(): Promise<any[]> {
    const cached = await this.get<any[]>('plans_list');
    if (cached) {
      return cached;
    }
    return null;
  }

  async setPlans(plans: any[]): Promise<void> {
    await this.set('plans_list', plans, 300);
  }

  async getUserCacheKey(userId: number): Promise<string> {
    return `user_${userId}`;
  }

  async invalidatePlans(): Promise<void> {
    await this.del('plans_list');
  }
}