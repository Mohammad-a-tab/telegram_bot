import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Config } from './entities/config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Config])],
  providers: [],
  controllers: [],
  exports: [TypeOrmModule],
})
export class ConfigModule {}