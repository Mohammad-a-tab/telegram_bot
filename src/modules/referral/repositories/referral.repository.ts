import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Referral } from '../entities/referral.entity';

@Injectable()
export class ReferralRepository {
  constructor(
    @InjectRepository(Referral)
    private readonly repo: Repository<Referral>,
  ) {}

  create(data: Partial<Referral>): Referral {
    return this.repo.create(data);
  }

  save(referral: Referral): Promise<Referral> {
    return this.repo.save(referral);
  }

  /** Check if this invitee was already referred by anyone */
  findByInvitee(inviteeId: number): Promise<Referral | null> {
    return this.repo.findOne({ where: { invitee_id: inviteeId } });
  }

  /** Count how many users this inviter has successfully referred */
  countByInviter(inviterId: number): Promise<number> {
    return this.repo.count({ where: { inviter_id: inviterId } });
  }

  /** Get all referrals for an inviter (to check milestone state) */
  findAllByInviter(inviterId: number): Promise<Referral[]> {
    return this.repo.find({ where: { inviter_id: inviterId } });
  }

  /** Find the latest referral row for an inviter to update milestone */
  findLatestByInviter(inviterId: number): Promise<Referral | null> {
    return this.repo.findOne({
      where: { inviter_id: inviterId },
      order: { created_at: 'DESC' },
    });
  }

  /** Find a dedicated milestone-tracking row (invitee_id = 0 sentinel) */
  findMilestoneRow(inviterId: number): Promise<Referral | null> {
    return this.repo.findOne({
      where: { inviter_id: inviterId, invitee_id: 0 as any },
    });
  }
}
