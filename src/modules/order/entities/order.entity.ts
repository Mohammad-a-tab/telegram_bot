import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Config } from '../../config/entities/config.entity';
import { Plan } from '../../plan/entities/plan.entity';
import { OrderStatus, GiftReason } from '../../../common/enums';

export { OrderStatus };

@Entity('orders')
@Index(['user_id', 'status'])
@Index(['status', 'created_at'])
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  @Index()
  user_id: number;

  @Column({ type: 'int', nullable: true })
  @Index()
  config_id: number;

  @Column({ type: 'int' })
  @Index()
  plan_id: number;

  @Column({ type: 'int' })
  amount: number;

  @Column({ nullable: true })
  payment_receipt_file_id: string;

  @Column({ type: 'smallint', default: OrderStatus.PENDING })
  @Index()
  status: OrderStatus;

  @Column({ nullable: true, type: 'text' })
  admin_message_id: string;

  /** ID of the discount code used for this order, if any */
  @Column({ type: 'int', nullable: true })
  discount_code_id: number | null;

  /**
   * Populated only for gifted orders (amount = 0).
   * Tells you WHY this config was given for free.
   * null → normal paid order.
   */
  @Column({ nullable: true, type: 'varchar', length: 32 })
  @Index()
  gift_reason: GiftReason | null;

  @CreateDateColumn()
  @Index()
  created_at: Date;

  @Column({ nullable: true })
  approved_at: Date;

  @Column({ nullable: true })
  expires_at: Date;

  @ManyToOne(() => User, (user) => user.id)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Config, (config) => config.id)
  @JoinColumn({ name: 'config_id' })
  config: Config;

  @ManyToOne(() => Plan, (plan) => plan.id)
  @JoinColumn({ name: 'plan_id' })
  plan: Plan;
}
