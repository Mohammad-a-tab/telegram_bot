import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  findById(id: number): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByRefCode(refCode: string): Promise<User | null> {
    return this.repo.findOne({ where: { ref_code: refCode } });
  }

  save(user: User): Promise<User> {
    return this.repo.save(user);
  }

  create(data: Partial<User>): User {
    return this.repo.create(data);
  }

  async updateMembership(id: number, isMember: boolean): Promise<void> {
    await this.repo.update({ id }, { is_member_of_channel: isMember });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.repo.findOne({ where: { username } });
  }

  /** Returns all user IDs — used for broadcast */
  findAllIds(): Promise<{ id: number }[]> {
    return this.repo.find({ select: ['id'] });
  }
}
