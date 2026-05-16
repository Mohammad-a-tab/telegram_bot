import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('discount_codes')
export class DiscountCode {
  @PrimaryGeneratedColumn()
  id: number;

  /** 8-character uppercase code */
  @Column({ unique: true, length: 8 })
  @Index()
  code: string;

  /** Discount percentage 1-100 */
  @Column({ type: 'smallint' })
  percent: number;

  /** Max total uses allowed */
  @Column({ type: 'int' })
  max_uses: number;

  /** How many times it has been used */
  @Column({ type: 'int', default: 0 })
  used_count: number;

  /** null = valid for all users; otherwise only for this telegram user_id */
  @Column({ type: 'bigint', nullable: true })
  @Index()
  restricted_user_id: number | null;

  /**
   * null = valid for all plans.
   * Stored as comma-separated plan IDs e.g. "1,3,5"
   */
  @Column({ type: 'text', nullable: true })
  plan_ids: string | null;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  // ── helpers ──────────────────────────────────────────────────────────────

  get planIdList(): number[] | null {
    if (!this.plan_ids) return null;
    return this.plan_ids.split(',').map(Number);
  }

  isValidForPlan(planId: number): boolean {
    const list = this.planIdList;
    return list === null || list.includes(planId);
  }

  isValidForUser(userId: number): boolean {
    return this.restricted_user_id === null || Number(this.restricted_user_id) === userId;
  }

  get hasUsesLeft(): boolean {
    return this.used_count < this.max_uses;
  }
}
