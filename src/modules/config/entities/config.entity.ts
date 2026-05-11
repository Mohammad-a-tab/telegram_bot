import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Plan } from '../../plan/entities/plan.entity';
import { Order } from '../../order/entities/order.entity';

@Entity('configs')
export class Config {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  plan_id: number;

  @Column({ type: 'text' })
  config_link: string;

  @Column({ type: 'boolean', default: false })
  is_sold_out: boolean;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Plan, (plan) => plan.id)
  @JoinColumn({ name: 'plan_id' })
  plan: Plan;

  @OneToMany(() => Order, (order) => order.config)
  orders: Order[];
}