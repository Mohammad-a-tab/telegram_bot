import 'reflect-metadata';
import { CacheService } from './src/modules/cache/cache.service';
import { CacheModule } from './src/modules/cache/cache.module';
import { Test } from '@nestjs/testing';

async function testCacheService() {
  console.log('🔄 Testing CacheService...\n');

  // ساخت ماژول تست
  const moduleRef = await Test.createTestingModule({
    imports: [CacheModule],
    providers: [CacheService],
  }).compile();

  const cacheService = moduleRef.get(CacheService);

  // 1. تست SET و GET
  console.log('📝 Test 1: SET & GET');
  await cacheService.set('test_key', { message: 'Hello from CacheService!' }, 60);
  const value = await cacheService.get('test_key');
  console.log(`   Result: ${JSON.stringify(value)}`);
  console.log('   ✅ Passed!\n');

  // 2. تست ساب لینک
  console.log('📝 Test 2: Sub Links Storage');
  const subs = ['https://test.com/sub/abc123', 'https://test.com/sub/def456'];
  await cacheService.set('sub_links_list', subs, 0);
  const savedSubs = await cacheService.get<string[]>('sub_links_list');
  console.log(`   Saved: ${JSON.stringify(savedSubs)}`);
  console.log('   ✅ Passed!\n');

  // 3. تست حذف
  console.log('📝 Test 3: DELETE');
  await cacheService.del('test_key');
  const deleted = await cacheService.get('test_key');
  console.log(`   After delete: ${deleted === null ? 'null (not found)' : 'found'}`);
  console.log('   ✅ Passed!\n');

  // 4. تست موجودی پلن
  console.log('📝 Test 4: Plan Stock Cache');
  await cacheService.set('remaining_stock_1', 10, 60);
  const stock = await cacheService.get<number>('remaining_stock_1');
  console.log(`   remaining_stock_1: ${stock}`);
  console.log('   ✅ Passed!\n');

  // 5. نمایش همه کلیدها (از طریق redis-cli نیاز است)
  console.log('📝 Test 5: Check with redis-cli');
  console.log('   Run: redis-cli KEYS "*"');
  console.log('   Expected: sub_links_list, remaining_stock_1\n');

  console.log('🎉 All CacheService tests passed!');
}

testCacheService().catch(console.error);