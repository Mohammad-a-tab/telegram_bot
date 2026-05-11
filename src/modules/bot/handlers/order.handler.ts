import { BotService } from '../bot.service';

export class OrderHandler {
  constructor(private readonly botService: BotService) {}

  async handleReceipt(msg: any): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const isMember = await this.botService.ensureMembership(userId, chatId);
    if (!isMember) return;

    const hasPending = await this.botService.hasPendingOrder(userId);
    if (hasPending) {
      await this.botService.sendMessage(chatId, '⚠️ شما یک سفارش در انتظار تایید دارید.');
      return;
    }

    const state = this.botService.getAdminState(userId);
    if (!state || state.action !== 'waiting_for_receipt') {
      await this.botService.sendMessage(chatId, '❌ لطفاً ابتدا از دکمه خرید استفاده کنید.');
      return;
    }

    await this.botService.processReceipt(msg, state);
  }
}