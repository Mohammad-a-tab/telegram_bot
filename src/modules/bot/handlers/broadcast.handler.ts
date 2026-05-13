import { Injectable, Logger } from '@nestjs/common';
import { AdminMiddleware } from '../../telegram/middlewares/admin.middleware';
import { AdminStateManager } from '../states/admin.state';
import { TelegramSender } from '../utils/telegram-sender';
import { UserRepository } from '../../user/repositories/user.repository';

/** Telegram allows ~30 messages/sec; we stay well under that */
const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 1000;

@Injectable()
export class BroadcastHandler {
  private readonly logger = new Logger(BroadcastHandler.name);

  constructor(
    private readonly adminMiddleware: AdminMiddleware,
    private readonly stateManager: AdminStateManager,
    private readonly sender: TelegramSender,
    private readonly userRepository: UserRepository,
  ) {}

  /** Step 1 — admin clicks "broadcast" button: ask for the message text */
  async startBroadcast(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    this.stateManager.set(userId, { action: 'broadcast' });
    await this.sender.send(
      bot,
      chatId,
      `📢 <b>ارسال پیام همگانی</b>\n\n` +
      `متن پیامی که می‌خواهید برای همه کاربران ارسال شود را بنویسید.\n\n` +
      `برای لغو: /cancel`,
      { parse_mode: 'HTML' },
    );
  }

  /** Step 2 — admin sends the message text: broadcast it to all users */
  async processBroadcast(bot: any, chatId: number, userId: number, text: string): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    this.stateManager.clear(userId);

    const users = await this.userRepository.findAllIds();
    const total = users.length;

    await this.sender.send(
      bot,
      chatId,
      `⏳ در حال ارسال پیام به ${total} کاربر...`,
    );

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async ({ id }) => {
          try {
            await bot.sendMessage(id, text, { parse_mode: 'HTML' });
            sent++;
          } catch {
            // User may have blocked the bot — silently skip
            failed++;
          }
        }),
      );

      // Rate-limit: wait between batches (skip delay after last batch)
      if (i + BATCH_SIZE < users.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    this.logger.log(`Broadcast complete: ${sent} sent, ${failed} failed out of ${total}`);

    await this.sender.send(
      bot,
      chatId,
      `✅ ارسال پیام همگانی تمام شد.\n\n` +
      `📊 نتیجه:\n` +
      `• ✅ موفق: ${sent}\n` +
      `• ❌ ناموفق (بلاک شده و غیره): ${failed}\n` +
      `• 👥 کل: ${total}`,
    );
  }
}
