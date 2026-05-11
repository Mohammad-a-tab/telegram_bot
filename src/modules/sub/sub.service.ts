import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sub } from './entities/sub.entity';

@Injectable()
export class SubService {
  constructor(
    @InjectRepository(Sub)
    private subRepository: Repository<Sub>,
  ) {}

  async getSub(): Promise<string | null> {
    const subs = await this.subRepository.find();
    if (subs.length === 0) {
      return null;
    }
    return subs[0].link;
  }

  async setSub(link: string): Promise<Sub> {
    await this.subRepository.clear();
    const newSub = this.subRepository.create({ link });
    return await this.subRepository.save(newSub);
  }

  async updateSub(link: string): Promise<Sub> {
    const subs = await this.subRepository.find();
    if (subs.length === 0) {
      return await this.setSub(link);
    }
    const existingSub = subs[0];
    existingSub.link = link;
    return await this.subRepository.save(existingSub);
  }

  async hasSub(): Promise<boolean> {
    const count = await this.subRepository.count();
    return count > 0;
  }

  async deleteSub(): Promise<void> {
    await this.subRepository.clear();
  }

  async getSubId(): Promise<number | null> {
    const subs = await this.subRepository.find();
    if (subs.length === 0) return null;
    return subs[0].id;
  }
}