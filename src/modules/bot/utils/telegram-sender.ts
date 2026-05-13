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
    try {
      await bot.editMessageReplyMarkup(markup, { chat_id: chatId, message_id: messageId });
    } catch (error) {
      this.logger.error(`editMessageReplyMarkup failed: ${error.message}`);
    }
  }
}
