import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, Index, OneToMany } from 'typeorm';
import { Order } from '../../order/entities/order.entity';

@Entity('users')
@Index(['is_member_of_channel', 'status'])
export class User {
  @PrimaryColumn({ type: 'bigint' })
  @Index()
  id: number;

  @Column({ nullable: true })
  first_name: string;

  @Column({ nullable: true })
  last_name: string;

  @Column({ nullable: true })
  @Index()
  username: string;

  @Column({ nullable: true, unique: true, length: 10 })
  @Index()
  ref_code: string;

  @Column({ default: false })
  is_member_of_channel: boolean;

  @Column({ type: 'boolean', default: true })  // true = active, false = banned
  status: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => Order, (order) => order.user)
  orders: Order[];
}