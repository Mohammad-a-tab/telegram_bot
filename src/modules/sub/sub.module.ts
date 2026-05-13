import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sub } from './entities/sub.entity';
import { SubRepository } from './repositories';
import { SubService } from './services';

@Module({
  imports: [TypeOrmModule.forFeature([Sub])],
  providers: [SubRepository, SubService],
  exports: [SubRepository, SubService],
})
export class SubModule {}
