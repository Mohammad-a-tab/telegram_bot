import { Module } from '@nestjs/common';
import { AdminMiddleware } from './middlewares/admin.middleware';
import { ChannelMiddleware } from './middlewares/channel.middleware';
import { UserModule } from '../user/user.module';
import { CacheModule } from '../cache/cache.module';
import { ReferralModule } from '../referral/referral.module';

@Module({
  imports: [UserModule, CacheModule, ReferralModule],
  providers: [AdminMiddleware, ChannelMiddleware],
  exports: [AdminMiddleware, ChannelMiddleware],
})
export class TelegramModule {}
