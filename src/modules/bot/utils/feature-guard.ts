/**
 * Feature Guard — Test Mode
 *
 * When TEST_MODE=true in .env, any feature wrapped with `isAllowed()`
 * will only be accessible to user IDs listed in TESTER_IDS.
 *
 * Usage:
 *   import { FeatureGuard } from '../utils/feature-guard';
 *
 *   if (!FeatureGuard.isAllowed(userId)) {
 *     await bot.sendMessage(chatId, '🚧 این قابلیت در دست توسعه است.');
 *     return;
 *   }
 *   // ... your new feature code
 */
export class FeatureGuard {
  private static readonly testMode: boolean =
    process.env.TEST_MODE === 'true';

  private static readonly testerIds: Set<number> = new Set(
    (process.env.TESTER_IDS ?? '')
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => !isNaN(id)),
  );

  /**
   * Returns true if the user is allowed to access a test-gated feature.
   * - When TEST_MODE is off  → everyone is allowed.
   * - When TEST_MODE is on   → only TESTER_IDS are allowed.
   */
  static isAllowed(userId: number): boolean {
    if (!this.testMode) return true;
    return this.testerIds.has(userId);
  }

  /** Convenience: send a "coming soon" message and return false when blocked. */
  static async guard(
    bot: any,
    chatId: number,
    userId: number,
    message = '🚧 این قابلیت در حال توسعه است و به زودی در دسترس قرار می‌گیرد.',
  ): Promise<boolean> {
    if (this.isAllowed(userId)) return true;
    await bot.sendMessage(chatId, message);
    return false;
  }
}
