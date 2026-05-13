import { Injectable } from '@nestjs/common';
import { SubService } from '../../sub/services';
import { AdminMiddleware } from '../../telegram/middlewares/admin.middleware';
import { AdminStateManager } from '../states/admin.state';
import { TelegramSender } from '../utils/telegram-sender';
import { subsManagementKeyboard } from '../keyboards/admin.keyboard';
import { SetSubDto } from '../../sub/dto';

@Injectable()
export class SubHandler {
  constructor(
    private readonly subService: SubService,
    private readonly adminMiddleware: AdminMiddleware,
    private readonly stateManager: AdminStateManager,
    private readonly sender: TelegramSender,
  ) {}

  async showSubsManagement(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    const status = (await this.subService.hasSub()) ? '✅ تنظیم شده' : '❌ تنظیم نشده';
    await this.sender.send(bot, chatId, `🔗 **مدیریت ساب لینک**\n\n📋 وضعیت فعلی: ${status}\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:`, subsManagementKeyboard);
  }

  async showSub(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    const link = await this.subService.getSub();
    if (!link) { await this.sender.send(bot, chatId, '⚠️ هیچ ساب لینکی تنظیم نشده است.'); return; }
    await this.sender.send(bot, chatId, `🔗 **ساب لینک فعلی:**\n\`${link}\``);
  }

  async startEditSub(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    this.stateManager.set(userId, { action: 'edit_sub', step: 1 });
    await this.sender.send(bot, chatId,
      `✏️ **ویرایش ساب لینک**\n\nلطفاً لینک جدید را وارد کنید:\n\n🔄 برای لغو: /cancel`,
    );
  }

  async deleteSub(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    if (!(await this.subService.hasSub())) { await this.sender.send(bot, chatId, '⚠️ هیچ ساب لینکی وجود ندارد.'); return; }
    await this.subService.deleteSub();
    await this.sender.send(bot, chatId, '✅ ساب لینک با موفقیت حذف شد.');
  }

  async processEditSub(bot: any, chatId: number, userId: number, text: string): Promise<void> {
    if (!text.startsWith('http://') && !text.startsWith('https://')) {
      await this.sender.send(bot, chatId, '❌ لینک نامعتبر است.');
      return;
    }
    const dto: SetSubDto = { link: text };
    await this.subService.setSub(dto);
    await this.sender.send(bot, chatId, `✅ **ساب لینک با موفقیت به‌روزرسانی شد:**\n\`${text}\``);
    this.stateManager.clear(userId);
  }
}
