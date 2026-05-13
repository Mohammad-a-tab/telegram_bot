import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sub } from '../entities/sub.entity';

@Injectable()
export class SubRepository {
  constructor(
    @InjectRepository(Sub)
    private readonly repo: Repository<Sub>,
  ) {}

  /** Fix: use findOne with explicit order instead of where: {} */
  findFirst(): Promise<Sub | null> {
    return this.repo.findOne({ where: {}, order: { id: 'ASC' } });
  }

  count(): Promise<number> {
    return this.repo.count();
  }

  save(sub: Sub): Promise<Sub> {
    return this.repo.save(sub);
  }

  create(data: Partial<Sub>): Sub {
    return this.repo.create(data);
  }

  async clear(): Promise<void> {
    await this.repo.clear();
  }
}
