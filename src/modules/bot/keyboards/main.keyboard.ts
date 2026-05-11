export const getMainKeyboard = (isAdmin: boolean = false) => {
  const keyboardRows = [
    [{ text: '🛒 خرید VPN' }],
    [{ text: '💬 پشتیبانی' }, { text: '🛍️ سرویس‌های من' }],
    [{ text: '🔧 نحوه اتصال' }]
  ];

  if (isAdmin) {
    keyboardRows.push([{ text: '🛠 پنل مدیریت' }]);
  }

  return {
    reply_markup: {
      keyboard: keyboardRows,
      resize_keyboard: true,
      one_time_keyboard: false,
      is_persistent: true
    }
  };
};

// src/modules/bot/keyboards/main.keyboard.ts

export const getPlanKeyboard = (plans: any[]) => {
  const planButtons = plans.map(plan => {
    let displayText = '';
    
    if (plan.has_discount && plan.discounted_price) {
      // نمایش با خط خوردگی روی قیمت اصلی و فلش به قیمت تخفیف‌دار
      displayText = `${plan.name} - ~~${plan.price.toLocaleString()}~~ → ${plan.discounted_price.toLocaleString()} تومان`;
    } else {
      displayText = `${plan.name} - ${plan.price.toLocaleString()} تومان`;
    }
    
    return [{ text: displayText, callback_data: `plan_${plan.id}` }];
  });

  return {
    reply_markup: {
      inline_keyboard: planButtons,
    },
  };
};
export const paymentKeyboard = (planId: number) => ({
  reply_markup: {
    inline_keyboard: [
      [{ text: '📤 ارسال رسید', callback_data: `send_receipt_${planId}` }],
      [{ text: '🔙 بازگشت', callback_data: 'buy' }]
    ]
  }
});