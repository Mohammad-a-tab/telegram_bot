import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { PlanRepository } from './repositories';
import { PlanService } from './services';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [TypeOrmModule.forFeature([Plan]), CacheModule],
  providers: [PlanRepository, PlanService],
  exports: [PlanRepository, PlanService],
})
export class PlanModule {}
