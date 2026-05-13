import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Config } from './entities/config.entity';
import { ConfigRepository } from './repositories';
import { ConfigService } from './services';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [TypeOrmModule.forFeature([Config]), OrderModule],
  providers: [ConfigRepository, ConfigService],
  exports: [ConfigRepository, ConfigService],
})
export class ConfigModule {}
