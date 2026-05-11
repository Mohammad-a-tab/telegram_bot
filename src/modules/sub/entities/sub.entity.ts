import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('subs')
export class Sub {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', unique: true })
  link: string;
}