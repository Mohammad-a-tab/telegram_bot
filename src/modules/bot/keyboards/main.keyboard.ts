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

export const getPlanKeyboard = (plans: any[]) => {
  const planButtons = plans.map(plan => {
    const displayPrice = plan.has_discount && plan.discounted_price 
      ? `${plan.discounted_price.toLocaleString()} تومان (قیمت اصلی: ${plan.price.toLocaleString()})`
      : `${plan.price.toLocaleString()} تومان`;
    return [{ text: `${plan.name} - ${displayPrice}`, callback_data: `plan_${plan.id}` }];
  });

  return {
    reply_markup: {
      inline_keyboard: planButtons
    }
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