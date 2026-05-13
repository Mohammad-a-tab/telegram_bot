import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, OneToMany, Index } from 'typeorm';
import { Order } from '../../order/entities/order.entity';
import { Config } from '../../config/entities/config.entity';
import { BandwidthUnit } from '../../../common/enums';

@Entity('plans')
@Index(['is_active', 'stock'])
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'int' })
  price: number;

  @Column({ type: 'int', nullable: true })
  discounted_price: number;

  @Column({ type: 'boolean', default: false })
  has_discount: boolean;

  @Column({ type: 'int' })
  duration_days: number;

  @Column({ type: 'int', default: 0 })
  bandwidth_value: number;

  @Column({ type: 'varchar', default: BandwidthUnit.GB })
  bandwidth_unit: BandwidthUnit;

  @Column({ type: 'int', nullable: true, default: 0 })
  stock: number;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => Order, (order) => order.plan)
  orders: Order[];

  @OneToMany(() => Config, (config) => config.plan)
  configs: Config[];
}
