import { Injectable } from '@nestjs/common';
import { CouponService } from '../../coupon/services/coupon.service';
import { PlanService } from '../../plan/services';
import { UserService } from '../../user/services/user.service';
import { AdminMiddleware } from '../../telegram/middlewares/admin.middleware';
import { AdminStateManager } from '../states/admin.state';
import { TelegramSender } from '../utils/telegram-sender';

@Injectable()
export class CouponHandler {
  constructor(
    private readonly couponService: CouponService,
    private readonly planService: PlanService,
    private readonly userService: UserService,
    private readonly adminMiddleware: AdminMiddleware,
    private readonly stateManager: AdminStateManager,
    private readonly sender: TelegramSender,
  ) {}

  // ─── Admin: show coupon management menu ──────────────────────────────────

  async showAdminMenu(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    await this.sender.send(bot, chatId,
      `🎟 مدیریت کدهای تخفیف\n\nاز منوی زیر انتخاب کنید:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ ایجاد کد تخفیف جدید', callback_data: 'admin_coupon_create' }],
            [{ text: '📋 لیست کدهای تخفیف', callback_data: 'admin_coupon_list' }],
            [{ text: '🔙 بازگشت', callback_data: 'admin_menu' }],
          ],
        },
      },
    );
  }

  // ─── Admin: start create flow ─────────────────────────────────────────────

  async startCreate(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    this.stateManager.set(userId, { action: 'coupon_create', step: 1, data: {} });
    await this.sender.send(bot, chatId,
      `➕ ایجاد کد تخفیف جدید\n\n` +
      `مرحله ۱/۴\n` +
      `💯 درصد تخفیف را وارد کنید (عدد بین ۱ تا ۱۰۰):`,
      { reply_markup: { inline_keyboard: [[{ text: '❌ لغو', callback_data: 'admin_coupon_menu' }]] } },
    );
  }

  // ─── Admin: process create steps ─────────────────────────────────────────

  async processCreate(bot: any, chatId: number, userId: number, text: string): Promise<void> {
    const state = this.stateManager.get(userId);
    if (!state || state.action !== 'coupon_create') return;

    const step = state.step ?? 1;
    const data = state.data ?? {};

    if (step === 1) {
      const percent = parseInt(text);
      if (isNaN(percent) || percent < 1 || percent > 100) {
        await this.sender.send(bot, chatId, '❌ عدد معتبر بین ۱ تا ۱۰۰ وارد کنید.');
        return;
      }
      data.percent = percent;
      this.stateManager.set(userId, { action: 'coupon_create', step: 2, data });
      await this.sender.send(bot, chatId,
        `مرحله ۲/۴\n🔢 حداکثر تعداد استفاده را وارد کنید (عدد صحیح):`,
        { reply_markup: { inline_keyboard: [[{ text: '❌ لغو', callback_data: 'admin_coupon_menu' }]] } },
      );
      return;
    }

    if (step === 2) {
      const maxUses = parseInt(text);
      if (isNaN(maxUses) || maxUses < 1) {
        await this.sender.send(bot, chatId, '❌ عدد معتبر بزرگتر از صفر وارد کنید.');
        return;
      }
      data.maxUses = maxUses;
      this.stateManager.set(userId, { action: 'coupon_create', step: 3, data });
      await this.sender.send(bot, chatId,
        `مرحله ۳/۴\n👤 یوزرنیم کاربر خاص را وارد کنید (بدون @).\n` +
        `اگر برای همه کاربران است، کلمه <b>all</b> را ارسال کنید:`,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '❌ لغو', callback_data: 'admin_coupon_menu' }]] },
        },
      );
      return;
    }

    if (step === 3) {
      const input = text.trim().replace(/^@/, '').toLowerCase();
      let restrictedUserId: number | null = null;

      if (input !== 'all') {
        const user = await this.userService.findByUsername(input);
        if (!user) {
          await this.sender.send(bot, chatId,
            `❌ کاربری با یوزرنیم <b>@${input}</b> در ربات یافت نشد.\n` +
            `کاربر باید حداقل یک بار ربات را استارت زده باشد.\n\nدوباره وارد کنید یا <b>all</b> برای همه:`,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '❌ لغو', callback_data: 'admin_coupon_menu' }]] } },
          );
          return;
        }
        restrictedUserId = user.id;
      }

      data.restrictedUserId = restrictedUserId;
      this.stateManager.set(userId, { action: 'coupon_create', step: 4, data });

      const plans = await this.planService.findAll();
      const planList = plans.map((p) => `• ${p.id}. ${p.name}`).join('\n');
      await this.sender.send(bot, chatId,
        `مرحله ۴/۴\n📦 شناسه پلن‌های مجاز را با کاما وارد کنید.\n` +
        `برای همه پلن‌ها عدد <b>0</b> ارسال کنید.\n\n` +
        `پلن‌های موجود:\n${planList}`,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '❌ لغو', callback_data: 'admin_coupon_menu' }]] },
        },
      );
      return;
    }

    if (step === 4) {
      let planIds: number[] | null = null;
      if (text.trim() !== '0') {
        planIds = text.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n) && n > 0);
        if (!planIds.length) {
          await this.sender.send(bot, chatId, '❌ شناسه پلن‌ها را درست وارد کنید یا 0 برای همه.');
          return;
        }
      }

      try {
        const coupon = await this.couponService.create({
          percent: data.percent,
          maxUses: data.maxUses,
          restrictedUserId: data.restrictedUserId,
          planIds,
        });

        const forUser = coupon.restricted_user_id
          ? await this.userService.findById(Number(coupon.restricted_user_id)).then(u => u?.username ? `@${u.username}` : `ID: ${coupon.restricted_user_id}`)
          : 'همه کاربران';
        const forPlans = coupon.plan_ids ? `پلن‌های ${coupon.plan_ids}` : 'همه پلن‌ها';

        await this.sender.send(bot, chatId,
          `✅ کد تخفیف با موفقیت ایجاد شد!\n\n` +
          `🎟 کد: <code>${coupon.code}</code>\n` +
          `💯 درصد تخفیف: ${coupon.percent}%\n` +
          `🔢 حداکثر استفاده: ${coupon.max_uses}\n` +
          `👤 مجاز برای: ${forUser}\n` +
          `📦 پلن‌ها: ${forPlans}`,
          {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت به منو', callback_data: 'admin_coupon_menu' }]] },
          },
        );
      } catch (e) {
        await this.sender.send(bot, chatId, `❌ خطا: ${e.message}`);
      }

      this.stateManager.clear(userId);
    }
  }

  // ─── Admin: list coupons ──────────────────────────────────────────────────

  async listCoupons(bot: any, chatId: number, userId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    const coupons = await this.couponService.findAll();
    if (!coupons.length) {
      await this.sender.send(bot, chatId, '⚠️ هیچ کد تخفیفی وجود ندارد.',
        { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: 'admin_coupon_menu' }]] } },
      );
      return;
    }

    const buttons = coupons.map((c) => [{
      text: `${c.is_active ? '✅' : '❌'} ${c.code} | ${c.percent}% | ${c.used_count}/${c.max_uses}`,
      callback_data: `admin_coupon_detail_${c.id}`,
    }]);
    buttons.push([{ text: '🔙 بازگشت', callback_data: 'admin_coupon_menu' }]);

    await this.sender.send(bot, chatId, `📋 لیست کدهای تخفیف (${coupons.length} عدد):`,
      { reply_markup: { inline_keyboard: buttons } },
    );
  }

  // ─── Admin: coupon detail ─────────────────────────────────────────────────

  async showDetail(bot: any, chatId: number, userId: number, couponId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    const c = await this.couponService.findById(couponId);
    if (!c) { await this.sender.send(bot, chatId, '❌ کد تخفیف یافت نشد.'); return; }

    const forUser = c.restricted_user_id
      ? await this.userService.findById(Number(c.restricted_user_id)).then(u => u?.username ? `@${u.username}` : `ID: ${c.restricted_user_id}`)
      : 'همه کاربران';
    const forPlans = c.plan_ids ? `پلن‌های ${c.plan_ids}` : 'همه پلن‌ها';

    await this.sender.send(bot, chatId,
      `🎟 جزئیات کد تخفیف\n\n` +
      `کد: <code>${c.code}</code>\n` +
      `وضعیت: ${c.is_active ? '✅ فعال' : '❌ غیرفعال'}\n` +
      `درصد تخفیف: ${c.percent}%\n` +
      `استفاده شده: ${c.used_count} از ${c.max_uses}\n` +
      `مجاز برای: ${forUser}\n` +
      `پلن‌ها: ${forPlans}\n` +
      `تاریخ ایجاد: ${new Date(c.created_at).toLocaleDateString('fa-IR')}`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: c.is_active ? '🚫 غیرفعال کردن' : '✅ فعال کردن', callback_data: `admin_coupon_toggle_${c.id}` }],
            [{ text: '🗑 حذف', callback_data: `admin_coupon_delete_${c.id}` }],
            [{ text: '🔙 بازگشت به لیست', callback_data: 'admin_coupon_list' }],
          ],
        },
      },
    );
  }

  // ─── Admin: toggle active ─────────────────────────────────────────────────

  async toggleCoupon(bot: any, chatId: number, userId: number, couponId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    try {
      const c = await this.couponService.toggle(couponId);
      await this.sender.send(bot, chatId,
        `✅ کد <code>${c.code}</code> ${c.is_active ? 'فعال' : 'غیرفعال'} شد.`,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت به لیست', callback_data: 'admin_coupon_list' }]] },
        },
      );
    } catch (e) {
      await this.sender.send(bot, chatId, `❌ ${e.message}`);
    }
  }

  // ─── Admin: delete ────────────────────────────────────────────────────────

  async deleteCoupon(bot: any, chatId: number, userId: number, couponId: number): Promise<void> {
    if (!this.adminMiddleware.isAdmin(userId)) return;
    await this.couponService.delete(couponId);
    await this.sender.send(bot, chatId, '✅ کد تخفیف حذف شد.',
      { reply_markup: { inline_keyboard: [[{ text: '🔙 بازگشت به لیست', callback_data: 'admin_coupon_list' }]] } },
    );
  }

  // ─── User: ask for coupon code ────────────────────────────────────────────

  async askForCoupon(bot: any, chatId: number, userId: number, planId: number): Promise<void> {
    this.stateManager.set(userId, { action: 'waiting_for_coupon', planId });
    await this.sender.send(bot, chatId,
      `🎟 کد تخفیف\n\n` +
      `آیا کد تخفیف دارید؟\n` +
      `کد خود را تایپ کرده و ارسال کنید یا از دکمه‌های زیر استفاده کنید:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚫 کد تخفیف ندارم', callback_data: `coupon_skip_${planId}` }],
            [{ text: '🔙 بازگشت به پلن‌ها', callback_data: 'buy' }],
          ],
        },
      },
    );
  }

  // ─── User: validate entered code ──────────────────────────────────────────

  async validateCoupon(bot: any, chatId: number, userId: number, code: string): Promise<void> {
    const state = this.stateManager.get(userId);
    if (!state || state.action !== 'waiting_for_coupon') return;

    const planId = state.planId!;
    const result = await this.couponService.validate(code, userId, planId);

    if (!result.valid) {
      await this.sender.send(bot, chatId,
        `${result.reason}\n\nمی‌توانید دوباره کد وارد کنید یا یکی از گزینه‌های زیر را انتخاب کنید:`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚫 ادامه بدون کد تخفیف', callback_data: `coupon_skip_${planId}` }],
              [{ text: '🔙 بازگشت به پلن‌ها', callback_data: 'buy' }],
            ],
          },
        },
      );
      return;
    }

    // Store coupon in state and proceed to payment
    this.stateManager.set(userId, {
      action: 'waiting_for_receipt',
      planId,
      data: { couponId: result.coupon!.id, couponCode: result.coupon!.code, couponPercent: result.coupon!.percent },
    });

    const plan = await this.planService.findById(planId);
    if (!plan) { await this.sender.send(bot, chatId, '❌ پلن یافت نشد.'); return; }

    const originalPrice = this.planService.getEffectivePrice(plan);
    const discountedPrice = this.couponService.applyDiscount(originalPrice, result.coupon!.percent);
    const fmt = (p: number) => (p * 1000).toLocaleString('en-US');

    await this.sender.send(bot, chatId,
      `✅ کد تخفیف <b>${result.coupon!.code}</b> اعمال شد!\n\n` +
      `💯 درصد تخفیف: ${result.coupon!.percent}%\n\n` +
      `💳 اطلاعات پرداخت\n\n` +
      `📦 پلن: ${plan.name}\n` +
      `💰 قیمت اصلی: ${fmt(originalPrice)} تومان\n` +
      `🏷️ تخفیف (${result.coupon!.percent}%): -${fmt(originalPrice - discountedPrice)} تومان\n` +
      `✅ مبلغ نهایی: <b>${fmt(discountedPrice)} تومان</b>\n\n` +
      `💳 شماره کارت:\n${process.env.CARD_NUMBER ?? '**********'}\n\n` +
      `👤 صاحب کارت:\n${process.env.CARD_HOLDER ?? 'نرگس کارگران'}\n\n` +
      `🖼 پس از پرداخت، تصویر رسید را ارسال کنید.`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📤 ارسال رسید', callback_data: `send_receipt_${planId}` }],
            [{ text: '🔙 بازگشت به پلن‌ها', callback_data: 'buy' }],
          ],
        },
      },
    );
  }
}
