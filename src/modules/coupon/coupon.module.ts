import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscountCode } from './entities/coupon.entity';
import { CouponRepository } from './repositories/coupon.repository';
import { CouponService } from './services/coupon.service';

@Module({
  imports: [TypeOrmModule.forFeature([DiscountCode])],
  providers: [CouponRepository, CouponService],
  exports: [CouponService],
})
export class CouponModule {}
