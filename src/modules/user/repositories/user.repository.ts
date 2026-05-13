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

  save(user: User): Promise<User> {
    return this.repo.save(user);
  }

  create(data: Partial<User>): User {
    return this.repo.create(data);
  }

  async updateMembership(id: number, isMember: boolean): Promise<void> {
    await this.repo.update({ id }, { is_member_of_channel: isMember });
  }
}
