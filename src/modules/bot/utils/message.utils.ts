export class MessageHelper {
    getWelcomeMessage(name: string): string {
      return `👋 سلام ${name}!\n\n🎉 به ربات ما خوش آمدید!\n\n🔐 شما میتوانید از ما VPN با قیمت مناسب و کیفیت بالا تهیه کنید.\n\n✨ ویژگی‌های ما:\n• قیمت مقرون به صرفه\n• پایداری و قابل اعتماد\n• پلن‌های متنوع\n• پشتیبانی سریع و حرفه‌ای`;
    }
  
    getConnectionGuide(): string {
      return `🔧 راهنمای اتصال به VPN:\n\n1️⃣ پس از خرید، کانفیگ برای شما ارسال می‌شود\n2️⃣ اپلیکیشن V2RayNG (اندروید) یا V2RayX (ویندوز) را نصب کنید\n3️⃣ کانفیگ دریافتی را import کنید\n4️⃣ اتصال را فعال کنید و اینترنت آزاد را تجربه کنید!`;
    }
  
    getMainKeyboard(isAdmin: boolean): any {
      const keyboard = [
        [{ text: '🛍️ خرید VPN' }],
        [{ text: '💬 پشتیبانی' }, { text: '📦 سرویس‌های من' }],
        [{ text: '🔧 نحوه اتصال' }]
      ];
      if (isAdmin) keyboard.push([{ text: '🛠 پنل مدیریت' }]);
      return { resize_keyboard: true, one_time_keyboard: false, is_persistent: true, keyboard };
    }
  }