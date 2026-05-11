import { BotService } from '../bot.service';
import { subsManagementKeyboard } from '../keyboards/admin.keyboard';

export class SubHandler {
  constructor(private readonly botService: BotService) {}

  async showManagement(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    
    const hasSub = await this.botService.sub.hasSub();
    const status = hasSub ? '✅ تنظیم شده' : '❌ تنظیم نشده';
    
    await this.botService.sendMessage(chatId, 
      `🔗 **مدیریت ساب لینک**\n\n📋 وضعیت فعلی: ${status}`,
      { parse_mode: 'Markdown', ...subsManagementKeyboard }
    );
  }

  async showSub(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    
    const subLink = await this.botService.sub.getSub();
    if (!subLink) {
      await this.botService.sendMessage(chatId, '⚠️ هیچ ساب لینکی تنظیم نشده است.');
      return;
    }
    
    await this.botService.sendMessage(chatId, 
      `🔗 **ساب لینک فعلی:**\n\`${subLink}\``, 
      { parse_mode: 'Markdown' }
    );
  }

  async startEditSub(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    
    this.botService.setAdminState(userId, { action: 'edit_sub', step: 1 });
    await this.botService.sendMessage(chatId, 
      `✏️ **ویرایش ساب لینک**\n\nلطفاً لینک جدید را وارد کنید:\n\n🔄 برای لغو: /cancel`,
      { parse_mode: 'Markdown' }
    );
  }

  async deleteSub(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    
    const hasSub = await this.botService.sub.hasSub();
    if (!hasSub) {
      await this.botService.sendMessage(chatId, '⚠️ هیچ ساب لینکی وجود ندارد.');
      return;
    }
    
    await this.botService.sub.deleteSub();
    await this.botService.sendMessage(chatId, '✅ ساب لینک با موفقیت حذف شد.');
  }

  async addSub(chatId: number, userId: number, subLink: string) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    
    if (!subLink.startsWith('http://') && !subLink.startsWith('https://')) {
      await this.botService.sendMessage(chatId, '❌ لینک نامعتبر است.');
      return;
    }
    
    await this.botService.sub.setSub(subLink);
    const allSubs = await this.botService.sub.getSub();
    
    await this.botService.sendMessage(chatId, 
      `✅ **ساب لینک با موفقیت اضافه شد!**\n\n📊 تعداد کل: ${allSubs.length}\n🔗 لینک: \`${subLink}\``,
      { parse_mode: 'Markdown' }
    );
  }

  async processEditSub(chatId: number, userId: number, text: string, state: any) {
    if (!text.startsWith('http://') && !text.startsWith('https://')) {
      await this.botService.sendMessage(chatId, '❌ لینک نامعتبر است.');
      return;
    }
    
    await this.botService.sub.setSub(text);
    await this.botService.sendMessage(chatId, 
      `✅ **ساب لینک با موفقیت به‌روزرسانی شد:**\n\`${text}\``,
      { parse_mode: 'Markdown' }
    );
    
    this.botService.clearAdminState(userId);
  }

  async processAddSub(chatId: number, userId: number, text: string, state: any) {
    if (!text.startsWith('http://') && !text.startsWith('https://')) {
      await this.botService.sendMessage(chatId, '❌ لینک نامعتبر است.');
      return;
    }
    
    await this.botService.sub.setSub(text);
    await this.botService.sendMessage(chatId, 
      `✅ **ساب لینک اضافه شد:**\n\`${text}\``,
      { parse_mode: 'Markdown' }
    );
    
    this.botService.clearAdminState(userId);
  }

  async showSubsManagement(chatId: number, userId: number) {
    if (!await this.botService.adminMiddleware.isAdmin(userId)) return;
    
    const hasSub = await this.botService.sub.hasSub();
    const status = hasSub ? '✅ تنظیم شده' : '❌ تنظیم نشده';
    
    await this.botService.sendMessage(chatId, 
      `🔗 **مدیریت ساب لینک**\n\n📋 وضعیت فعلی: ${status}\n\nلطفاً یکی از گزینه‌های زیر را انتخاب کنید:`,
      { parse_mode: 'Markdown', ...subsManagementKeyboard }
    );
  }
}