import { Injectable } from '@nestjs/common';

@Injectable()
export class AdminMiddleware {
  private readonly adminIds: number[];

  constructor() {
    this.adminIds = (process.env.ADMIN_IDS ?? '')
      .split(',')
      .map((id) => parseInt(id.trim()))
      .filter((id) => !isNaN(id));
  }

  isAdmin(userId: number): boolean {
    return this.adminIds.includes(userId);
  }
}
