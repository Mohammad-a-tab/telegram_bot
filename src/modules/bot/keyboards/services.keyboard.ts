export const getServicesListKeyboard = (services: any[]) => {
    const keyboard = services.map(service => [
      { text: `🛍️ ${service.name}`, callback_data: `service_detail_${service.id}` }
    ]);
    
    keyboard.push([{ text: '🔙 بازگشت به صفحه اصلی', callback_data: 'main_menu' }]);
    
    return {
      reply_markup: {
        inline_keyboard: keyboard
      }
    };
  };
  
  export const getServiceDetailKeyboard = (configLink: string) => ({
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔗 دریافت لینک اشتراک', callback_data: `copy_config_${configLink}` }],
        [{ text: '🔙 بازگشت به لیست سرویس‌ها', callback_data: 'back_to_services' }]
      ]
    }
  });