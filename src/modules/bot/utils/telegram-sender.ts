import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TelegramSender {
  private readonly logger = new Logger(TelegramSender.name);

  async send(bot: any, chatId: number, text: string, options: any = {}): Promise<any> {
    if (!text?.trim()) {
      this.logger.warn('Attempted to send empty message');
      return null;
    }
    try {
      return await bot.sendMessage(chatId, text, options);
    } catch (error) {
      this.logger.error(`sendMessage failed to ${chatId}: ${error.message}`);
      // retry without parse_mode
      try {
        const { parse_mode, ...rest } = options;
        return await bot.sendMessage(chatId, text, rest);
      } catch {
        return null;
      }
    }
  }

  async answerCallback(bot: any, id: string): Promise<void> {
    try {
      await bot.answerCallbackQuery(id);
    } catch (error) {
      this.logger.error(`answerCallbackQuery failed: ${error.message}`);
    }
  }

  async editReplyMarkup(bot: any, chatId: number, messageId: number, markup: any): Promise<void> {
    if (!chatId || !messageId) return;
    try {
      await bot.editMessageReplyMarkup(markup, { chat_id: chatId, message_id: messageId });
    } catch (error) {
      const msg: string = error?.message ?? '';
      // These are expected non-fatal cases: message already edited, deleted, or too old
      const isExpected =
        msg.includes('message to edit not found') ||
        msg.includes('message is not modified') ||
        msg.includes('MESSAGE_ID_INVALID');
      if (isExpected) {
        this.logger.warn(`editMessageReplyMarkup skipped (${msg}) — chat: ${chatId}, msg: ${messageId}`);
      } else {
        this.logger.error(`editMessageReplyMarkup failed: ${msg}`);
      }
    }
  }
}
