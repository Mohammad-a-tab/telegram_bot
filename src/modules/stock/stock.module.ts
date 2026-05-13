import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Config } from '../config/entities/config.entity';
import { Plan } from '../plan/entities/plan.entity';
import { StockService, StockCheckerService } from './services';
import { ConfigRepository } from '../config/repositories';
import { PlanRepository } from '../plan/repositories';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [TypeOrmModule.forFeature([Config, Plan]), CacheModule],
  providers: [ConfigRepository, PlanRepository, StockService, StockCheckerService],
  exports: [StockService, StockCheckerService],
})
export class StockModule {}
