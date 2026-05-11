import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sub } from './entities/sub.entity';
import { SubService } from './sub.service';

@Module({
  imports: [TypeOrmModule.forFeature([Sub])],
  providers: [SubService],
  exports: [SubService, TypeOrmModule],
})
export class SubModule {}