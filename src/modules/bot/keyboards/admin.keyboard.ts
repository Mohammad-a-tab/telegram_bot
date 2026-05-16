// src/modules/bot/keyboards/admin.keyboard.ts

export const adminMainKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '📦 پلن‌ها', callback_data: 'admin_plans_menu' }],
      [{ text: '🔗 ساب لینک', callback_data: 'admin_subs_menu' }],
      [{ text: '⚙️ کانفیگ‌ها', callback_data: 'admin_configs_menu' }],
      [{ text: '📋 سفارشات', callback_data: 'admin_orders_menu' }],
      [{ text: '🏷️ تخفیف پلن', callback_data: 'admin_discount_menu' }],
      [{ text: '🎟 کدهای تخفیف', callback_data: 'admin_coupon_menu' }],
      [{ text: '📢 پیام همگانی', callback_data: 'admin_broadcast' }],
      [{ text: '🔙 خروج', callback_data: 'admin_back' }],
    ],
  },
};

export const plansManagementKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '➕ افزودن پلن جدید', callback_data: 'admin_add_plan' }],
      [{ text: '📋 لیست پلن‌ها', callback_data: 'admin_list_plans' }],
      [{ text: '✏️ ویرایش پلن', callback_data: 'admin_edit_plan' }],
      [{ text: '🗑 حذف پلن', callback_data: 'admin_delete_plan' }],
      [{ text: '🔄 فعال/غیرفعال کردن', callback_data: 'admin_toggle_plan' }],
      [{ text: '🏷️ مدیریت تخفیف', callback_data: 'admin_discount_menu' }],  // جدید
      [{ text: '🔙 بازگشت به منوی اصلی', callback_data: 'admin_menu' }]
    ]
  }
};

export const discountManagementKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '🎁 فعال‌سازی تخفیف روی پلن', callback_data: 'admin_enable_discount' }],
      [{ text: '🚫 غیرفعال‌سازی تخفیف روی پلن', callback_data: 'admin_disable_discount' }],
      [{ text: '🚫 غیرفعال‌سازی همه تخفیف‌ها', callback_data: 'admin_disable_all_discounts' }],
      [{ text: '🔙 بازگشت', callback_data: 'admin_plans_menu' }]
    ]
  }
};

export const subsManagementKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '🔗 مشاهده ساب لینک فعلی', callback_data: 'admin_view_sub' }],
      [{ text: '✏️ ویرایش ساب لینک', callback_data: 'admin_edit_sub' }],
      [{ text: '🗑 حذف ساب لینک', callback_data: 'admin_delete_sub' }],
      [{ text: '🔙 بازگشت به منوی اصلی', callback_data: 'admin_menu' }]
    ]
  }
};

export const configsManagementKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '➕ افزودن کانفیگ', callback_data: 'admin_add_config_to_plan' }],
      [{ text: '📋 لیست کانفیگ‌ها', callback_data: 'admin_list_configs' }],
      [{ text: '🗑 حذف کانفیگ', callback_data: 'admin_delete_config' }],
      [{ text: '🔙 بازگشت به منوی اصلی', callback_data: 'admin_menu' }]
    ]
  }
};

export const ordersManagementKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '📋 لیست سفارشات', callback_data: 'admin_list_orders' }],
      [{ text: '⏳ سفارشات در انتظار', callback_data: 'admin_pending_orders' }],
      [{ text: '✅ سفارشات تایید شده', callback_data: 'admin_approved_orders' }],
      [{ text: '❌ سفارشات رد شده', callback_data: 'admin_rejected_orders' }],
      [{ text: '🔙 بازگشت به منوی اصلی', callback_data: 'admin_menu' }]
    ]
  }
};

export const planListKeyboard = (plans: any[], page: number = 0, itemsPerPage: number = 5) => {
  const start = page * itemsPerPage;
  const end = start + itemsPerPage;
  const pagePlans = plans.slice(start, end);
  
  const keyboard = pagePlans.map(plan => [
    { text: `${plan.id}. ${plan.name} - ${plan.is_active ? '✅' : '❌'}`, callback_data: `admin_select_plan_${plan.id}` }
  ]);
  
  const navButtons = [];
  if (page > 0) {
    navButtons.push({ text: '⬅️ قبلی', callback_data: `admin_plans_page_${page - 1}` });
  }
  if (end < plans.length) {
    navButtons.push({ text: '➡️ بعدی', callback_data: `admin_plans_page_${page + 1}` });
  }
  
  if (navButtons.length > 0) {
    keyboard.push(navButtons);
  }
  
  keyboard.push([{ text: '🔙 بازگشت به منوی مدیریت', callback_data: 'admin_plans_menu' }]);
  
  return { reply_markup: { inline_keyboard: keyboard } };
};

export const planActionKeyboard = (planId: number) => ({
  reply_markup: {
    inline_keyboard: [
      [
        { text: '✏️ ویرایش', callback_data: `admin_edit_plan_${planId}` },
        { text: '🗑 حذف', callback_data: `admin_delete_plan_${planId}` }
      ],
      [
        { text: '🔄 تغییر وضعیت', callback_data: `admin_toggle_plan_${planId}` },
        { text: '📊 ویرایش موجودی', callback_data: `admin_edit_stock_${planId}` }
      ],
      [{ text: '🔙 بازگشت به لیست', callback_data: 'admin_list_plans' }]
    ]
  }
});