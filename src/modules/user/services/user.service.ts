import { Injectable, Logger } from '@nestjs/common';
import { UserRepository } from '../repositories/user.repository';
import { User } from '../entities/user.entity';

const REF_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const REF_CODE_LENGTH = 10;

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly userRepository: UserRepository) {}

  findById(id: number): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  findByRefCode(refCode: string): Promise<User | null> {
    return this.userRepository.findByRefCode(refCode);
  }

  /** Generate a unique 10-char alphanumeric ref code */
  private generateRefCode(): string {
    let code = '';
    for (let i = 0; i < REF_CODE_LENGTH; i++) {
      code += REF_CODE_CHARS[Math.floor(Math.random() * REF_CODE_CHARS.length)];
    }
    return code;
  }

  /** Get or create a ref code for a user */
  async ensureRefCode(id: number): Promise<string> {
    const user = await this.userRepository.findById(id);
    if (!user) throw new Error(`User ${id} not found`);
    if (user.ref_code) return user.ref_code;

    // Generate a collision-free code
    let code: string;
    let attempts = 0;
    do {
      code = this.generateRefCode();
      const existing = await this.userRepository.findByRefCode(code);
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    user.ref_code = code;
    await this.userRepository.save(user);
    return code;
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
        const refCode = this.generateRefCode();
        const user = this.userRepository.create({
          id,
          username: username ?? null,
          first_name: firstName ?? null,
          last_name: lastName ?? null,
          status: true,
          is_member_of_channel: false,
          ref_code: refCode,
        });
        await this.userRepository.save(user);
        this.logger.log(`New user created: ${id} (${firstName ?? 'no name'})`);
        return;
      }

      let changed = false;
      if (username && existing.username !== username) { existing.username = username; changed = true; }
      if (firstName && existing.first_name !== firstName) { existing.first_name = firstName; changed = true; }
      if (lastName && existing.last_name !== lastName) { existing.last_name = lastName; changed = true; }
      // Backfill ref_code for existing users who don't have one yet
      if (!existing.ref_code) {
        existing.ref_code = this.generateRefCode();
        changed = true;
      }

      if (changed) await this.userRepository.save(existing);
    } catch (error) {
      this.logger.error(`Error upserting user ${id}: ${error.message}`);
    }
  }

  async updateMembership(id: number, isMember: boolean): Promise<void> {
    await this.userRepository.updateMembership(id, isMember);
  }
}
