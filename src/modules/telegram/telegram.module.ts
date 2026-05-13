import { Module } from '@nestjs/common';
import { AdminMiddleware } from './middlewares/admin.middleware';
import { ChannelMiddleware } from './middlewares/channel.middleware';
import { UserModule } from '../user/user.module';

@Module({
  imports: [UserModule],
  providers: [AdminMiddleware, ChannelMiddleware],
  exports: [AdminMiddleware, ChannelMiddleware],
})
export class TelegramModule {}
