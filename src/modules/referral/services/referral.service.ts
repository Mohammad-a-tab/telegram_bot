import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReferralRepository } from '../repositories/referral.repository';
import { Referral } from '../entities/referral.entity';
import { Order } from '../../order/entities/order.entity';
import { Config } from '../../config/entities/config.entity';
import { Plan } from '../../plan/entities/plan.entity';
import { User } from '../../user/entities/user.entity';
import { OrderStatus, BandwidthUnit, GiftReason } from '../../../common/enums';

/** Milestone definitions: invite N friends → reward plan matched by bandwidth */
const MILESTONES: { threshold: number; bandwidthValue: number; bandwidthUnit: BandwidthUnit; giftReason: GiftReason }[] = [
  { threshold: 3,  bandwidthValue: 100, bandwidthUnit: BandwidthUnit.MB, giftReason: GiftReason.REFERRAL_3  },
  { threshold: 12, bandwidthValue: 500, bandwidthUnit: BandwidthUnit.MB, giftReason: GiftReason.REFERRAL_12 },
];

export interface ReferralRewardResult {
  awarded: boolean;
  planName?: string;
  configLink?: string;
}

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);
  private readonly botUsername = process.env.BOT_USERNAME ?? '';

  constructor(
    private readonly referralRepository: ReferralRepository,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Generate the invite link using the user's ref code */
  getInviteLink(refCode: string): string {
    return `https://t.me/${this.botUsername}?start=ref_${refCode}`;
  }

  /**
   * Parse a /start payload and return the ref code, or null.
   * Payload format: ref_<10-char-code>
   */
  parseStartPayload(payload: string): string | null {
    if (!payload?.startsWith('ref_')) return null;
    const code = payload.slice(4);
    // Validate: exactly 10 alphanumeric chars
    return /^[A-Za-z0-9]{10}$/.test(code) ? code : null;
  }

  /**
   * Resolve a ref code to the inviter's user id.
   * Returns null if the code doesn't exist.
   */
  async resolveRefCode(refCode: string): Promise<number | null> {
    const user = await this.dataSource.manager.findOne(User, {
      where: { ref_code: refCode },
      select: ['id'],
    });
    return user ? Number(user.id) : null;
  }

  /**
   * Called when a new user joins via a referral link AND confirms membership.
   * Records the referral and checks if the inviter hit a milestone.
   */
  async recordAndCheckReward(
    inviterId: number,
    inviteeId: number,
  ): Promise<ReferralRewardResult> {
    // Self-referral guard
    if (inviterId === inviteeId) return { awarded: false };

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Idempotency: skip if this invitee was already recorded
      const existing = await queryRunner.manager.findOne(Referral, {
        where: { invitee_id: inviteeId },
      });
      if (existing) {
        await queryRunner.rollbackTransaction();
        return { awarded: false };
      }

      // Save the referral row
      const referral = queryRunner.manager.create(Referral, {
        inviter_id: inviterId,
        invitee_id: inviteeId,
      });
      await queryRunner.manager.save(referral);

      // Count total confirmed referrals for this inviter
      const total = await queryRunner.manager.count(Referral, {
        where: { inviter_id: inviterId },
      });

      // Find the highest milestone already rewarded
      const allRows = await queryRunner.manager.find(Referral, {
        where: { inviter_id: inviterId },
      });
      const maxRewarded = allRows.reduce(
        (max, r) => Math.max(max, r.rewarded_milestone ?? 0),
        0,
      );

      // Check if we just crossed a new milestone
      const milestone = [...MILESTONES]
        .reverse()
        .find((m) => total >= m.threshold && m.threshold > maxRewarded);

      if (!milestone) {
        await queryRunner.commitTransaction();
        return { awarded: false };
      }

      // Find the reward plan by bandwidth value + unit (not by name)
      const plan = await queryRunner.manager.findOne(Plan, {
        where: {
          bandwidth_value: milestone.bandwidthValue,
          bandwidth_unit: milestone.bandwidthUnit,
          is_active: true,
        },
      });
      if (!plan) {
        this.logger.error(
          `Reward plan ${milestone.bandwidthValue}${milestone.bandwidthUnit} not found or inactive — rolling back so reward can be retried`,
        );
        await queryRunner.rollbackTransaction();
        return { awarded: false };
      }

      // Grab a free config for this plan
      const config = await queryRunner.manager.findOne(Config, {
        where: { plan_id: plan.id, is_sold_out: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!config) {
        this.logger.error(
          `No available config for reward plan ${milestone.bandwidthValue}${milestone.bandwidthUnit} — rolling back so reward can be retried`,
        );
        await queryRunner.rollbackTransaction();
        return { awarded: false };
      }

      // Mark config as used
      config.is_sold_out = true;
      if (plan.stock > 0) plan.stock -= 1;
      await queryRunner.manager.save(config);
      await queryRunner.manager.save(plan);

      // Create a free approved order for the inviter
      const order = queryRunner.manager.create(Order, {
        user_id: inviterId,
        plan_id: plan.id,
        config_id: config.id,
        amount: 0,
        status: OrderStatus.APPROVED,
        approved_at: new Date(),
        gift_reason: milestone.giftReason,
      });
      await queryRunner.manager.save(order);

      // Mark the milestone on the referral row we just saved
      referral.rewarded_milestone = milestone.threshold;
      await queryRunner.manager.save(referral);

      await queryRunner.commitTransaction();

      return {
        awarded: true,
        planName: plan.name,
        configLink: config.config_link,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`recordAndCheckReward failed: ${error.message}`);
      return { awarded: false };
    } finally {
      await queryRunner.release();
    }
  }

  /** How many confirmed referrals does this user have */
  async getInviteCount(userId: number): Promise<number> {
    return this.referralRepository.countByInviter(userId);
  }

  /** Cache key for storing pending inviter id before membership is confirmed */
  getPendingKey(inviteeId: number): string {
    return `pending_ref_${inviteeId}`;
  }
}
