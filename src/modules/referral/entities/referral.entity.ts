import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('referrals')
@Unique(['invitee_id']) // each user can only be referred once
export class Referral {
  @PrimaryGeneratedColumn()
  id: number;

  /** The user who shared the invite link */
  @Column({ type: 'bigint' })
  @Index()
  inviter_id: number;

  /** The new user who joined via the link */
  @Column({ type: 'bigint' })
  @Index()
  invitee_id: number;

  /**
   * Tracks which milestone reward has already been given to the inviter.
   * null  = no reward yet
   * 3     = 100 MB plan awarded
   * 10    = 500 MB plan awarded
   */
  @Column({ type: 'int', nullable: true })
  rewarded_milestone: number | null;

  @CreateDateColumn()
  created_at: Date;
}
