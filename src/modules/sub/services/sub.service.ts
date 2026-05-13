import { Injectable } from '@nestjs/common';
import { SubRepository } from '../repositories/sub.repository';
import { SetSubDto } from '../dto';

@Injectable()
export class SubService {
  constructor(private readonly subRepository: SubRepository) {}

  async getSub(): Promise<string | null> {
    const sub = await this.subRepository.findFirst();
    return sub?.link ?? null;
  }

  async setSub(dto: SetSubDto): Promise<void> {
    await this.subRepository.clear();
    const sub = this.subRepository.create({ link: dto.link });
    await this.subRepository.save(sub);
  }

  async hasSub(): Promise<boolean> {
    return (await this.subRepository.count()) > 0;
  }

  async deleteSub(): Promise<void> {
    await this.subRepository.clear();
  }
}
