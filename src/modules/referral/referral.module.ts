import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Referral } from './entities/referral.entity';
import { ReferralRepository } from './repositories/referral.repository';
import { ReferralService } from './services/referral.service';
import { ReferralHandler } from './handlers/referral.handler';
import { UserModule } from '../user/user.module';
import { TelegramSender } from '../bot/utils/telegram-sender';

@Module({
  imports: [TypeOrmModule.forFeature([Referral]), UserModule],
  providers: [ReferralRepository, ReferralService, ReferralHandler, TelegramSender],
  exports: [ReferralService, ReferralHandler],
})
export class ReferralModule {}
