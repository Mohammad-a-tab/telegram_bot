import { Module, Logger } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { CacheService } from './cache.service';

const logger = new Logger('CacheModule');

@Module({
  imports: [
    NestCacheModule.registerAsync({
      useFactory: async () => {
        const host = process.env.REDIS_HOST || 'localhost';
        const port = parseInt(process.env.REDIS_PORT) || 6379;

        try {
          // Dynamically import so missing redis doesn't crash startup
          const { redisStore } = await import('cache-manager-redis-yet');

          const store = await redisStore({
            socket: { host, port, connectTimeout: 3000 },
          });

          logger.log(`✅ Redis connected at ${host}:${port}`);
          return { store };
        } catch (error) {
          logger.warn(
            `⚠️ Redis unavailable (${host}:${port}) — falling back to in-memory cache. Error: ${error.message}`,
          );
          // Return empty config = NestJS default in-memory store
          return {};
        }
      },
    }),
  ],
  providers: [CacheService],
  exports: [CacheService, NestCacheModule],
})
export class CacheModule {}
