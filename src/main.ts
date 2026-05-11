import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import { BotService } from './modules/bot/bot.service';

dotenv.config();

let botService: BotService;
let isShuttingDown = false;

async function bootstrap() {
  console.log('🤖 Starting VPN Telegram Bot...');
  console.log('================================');
  
  const app = await NestFactory.create(AppModule);
  botService = app.get(BotService);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    console.error('❌ Error: TELEGRAM_BOT_TOKEN is not set in .env file');
    process.exit(1);
  }

  process.on('SIGINT', () => gracefulShutdown());
  process.on('SIGTERM', () => gracefulShutdown());

  process.on('uncaughtException', (error) => {
    console.error('🔥 Uncaught Exception:', error.message);
    console.error(error.stack);

    if (!isShuttingDown) {
      console.log('⚠️ Bot continues running...');
    }
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 Unhandled Rejection:', reason);
  });

  try {
    await botService.init(token);
    console.log('✅ Telegram bot connected successfully!');
    console.log('💡 Send /start to your bot on Telegram');
    
    await app.listen(3000);
    console.log('🚀 Server running on port 3000');
    console.log('================================');
  } catch (error) {
    console.error('❌ Failed to start bot:', error.message);
    console.log('🔄 Will retry in 10 seconds...');
    setTimeout(() => {
      process.exit(1);
    }, 10000);
  }
}

async function gracefulShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log('🛑 Shutting down gracefully...');
  
  if (botService) {
    try {
      await botService.stop();
      console.log('✅ Bot stopped gracefully');
    } catch (error) {
      console.error('❌ Error stopping bot:', error.message);
    }
  }
  
  setTimeout(() => {
    console.log('👋 Goodbye!');
    process.exit(0);
  }, 2000);
}

process.on('exit', (code) => {
  if (code !== 0 && !isShuttingDown) {
    console.log(`⚠️ Process exited with code ${code}`);
  }
});

bootstrap();