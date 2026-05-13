import { Injectable, Logger } from '@nestjs/common';
import { UserRepository } from '../repositories/user.repository';
import { User } from '../entities/user.entity';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly userRepository: UserRepository) {}

  findById(id: number): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  async upsert(
    id: number,
    username?: string,
    firstName?: string,
    lastName?: string,
  ): Promise<void> {
    try {
      const existing = await this.userRepository.findById(id);

      if (!existing) {
        const user = this.userRepository.create({
          id,
          username: username ?? null,
          first_name: firstName ?? null,
          last_name: lastName ?? null,
          status: true,
          is_member_of_channel: false,
        });
        await this.userRepository.save(user);
        this.logger.log(`New user created: ${id} (${firstName ?? 'no name'})`);
        return;
      }

      let changed = false;
      if (username && existing.username !== username) { existing.username = username; changed = true; }
      if (firstName && existing.first_name !== firstName) { existing.first_name = firstName; changed = true; }
      if (lastName && existing.last_name !== lastName) { existing.last_name = lastName; changed = true; }

      if (changed) await this.userRepository.save(existing);
    } catch (error) {
      this.logger.error(`Error upserting user ${id}: ${error.message}`);
    }
  }

  async updateMembership(id: number, isMember: boolean): Promise<void> {
    await this.userRepository.updateMembership(id, isMember);
  }
}
