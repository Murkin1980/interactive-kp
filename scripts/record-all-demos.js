const { chromium } = require('playwright');

const AUTH_STATE = 'C:\\tmp\\interactive-kp-demo-auth.json';
const REC = 'C:\\Users\\Мурат\\OneDrive\\Documents\\Interactive Offer\\interactive-kp\\public\\demos\\recordings';
const VP = { width: 1440, height: 900 };
const SLOW = 300;
const P = async (pg, ms) => pg.waitForTimeout(ms);

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: SLOW });
  
  // ═══════════════════════════════════════
  // PHASE 1: Create test data (no recording)
  // ═══════════════════════════════════════
  console.log('\n--- Phase 1: Creating test data ---');
  let ctx = await browser.newContext({ viewport: VP, storageState: AUTH_STATE });
  let page = await ctx.newPage();
  
  // Create client
  await page.goto('https://kp.salamat-mebel.kz/clients/new', { waitUntil: 'networkidle' });
  await P(page, 2000);
  await page.locator('#name').fill('Тестов Тест Тестович');
  await P(page, 400);
  await page.locator('#phone').fill('+7 700 123 4567');
  await P(page, 400);
  await page.locator('#email').fill('test@example.com');
  await P(page, 400);
  await page.locator('#notes').fill('Тестовый клиент для демо');
  await P(page, 400);
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await P(page, 3000);
  console.log('Client created');
  
  // Create KP
  await page.goto('https://kp.salamat-mebel.kz/proposals/new', { waitUntil: 'networkidle' });
  await P(page, 2000);
  
  const sel = page.locator('select').first();
  const n = await sel.locator('option').count();
  if (n > 1) { await sel.selectOption({ index: 1 }); await P(page, 1000); }
  
  await page.locator('#project_name').fill('Кухня в стиле минимализм');
  await P(page, 400);
  const dateEl = page.locator('input[type="date"]').first();
  if (await dateEl.isVisible()) { await dateEl.fill('2026-08-15'); await P(page, 400); }
  const advEl = page.locator('input[type="number"]').first();
  if (await advEl.isVisible()) { await advEl.fill('50'); await P(page, 400); }
  
  await page.getByRole('button', { name: 'Создать КП' }).click();
  await P(page, 4000);
  const kpId = page.url().split('/').pop();
  console.log('KP created:', kpId);
  
  // Scroll to items area
  await page.mouse.wheel(0, 600);
  await P(page, 1500);
  
  // Add item 1
  const addBtn = page.getByRole('button', { name: /добавить позицию/i });
  if (await addBtn.isVisible()) {
    await addBtn.click();
    await P(page, 1500);
    
    // Item name: placeholder="Название позиции"
    await page.locator('input[placeholder="Название позиции"]').fill('Кухонный шкаф верхний');
    await P(page, 400);
    // Dimensions: placeholder="2400 × 1200 × 600 мм"
    await page.locator('input[placeholder*="×"]').fill('800×350×720');
    await P(page, 400);
    // Quantity: input[type=number] after dimensions
    const numInputs = page.locator('input[type="number"]');
    const qtyCount = await numInputs.count();
    // The quantity field should be near the item form
    // Let's use the one without min/max constraints
    for (let i = 0; i < qtyCount; i++) {
      const el = numInputs.nth(i);
      const ph = await el.getAttribute('placeholder');
      if (!ph) {
        await el.fill('2');
        await P(page, 400);
        break;
      }
    }
    
    await page.locator('button').filter({ hasText: /^Добавить$/ }).last().click();
    await P(page, 2500);
    console.log('Item 1 added');
  }
  
  // Add variant 1
  const addVar1 = page.getByRole('button', { name: /добавить вариант/i }).first();
  if (await addVar1.isVisible()) {
    await addVar1.click();
    await P(page, 1500);
    
    // Variant name: placeholder="Например: Подсветка" (in options section)
    // Actually variants use different placeholders — let me check by placeholder patterns
    await page.locator('input[placeholder*="название"]').last().fill('ЛДСП Белый глянец');
    await P(page, 400);
    
    // Material
    const matPh = page.locator('input[placeholder*="Материал"], input[placeholder*="материал"]').first();
    if (await matPh.isVisible().catch(() => false)) {
      await matPh.fill('ЛДСП 18мм');
      await P(page, 400);
    }
    
    // Price
    await page.locator('input[placeholder*="₸"], input[placeholder*="цена"], input[placeholder*="Цена"]').first().fill('45000');
    await P(page, 400);
    
    await page.locator('button').filter({ hasText: /^Добавить$/ }).last().click();
    await P(page, 2500);
    console.log('Variant 1 added');
  }
  
  // Add variant 2
  const addVar2 = page.getByRole('button', { name: /добавить вариант/i }).first();
  if (await addVar2.isVisible()) {
    await addVar2.click();
    await P(page, 1500);
    
    await page.locator('input[placeholder*="название"]').last().fill('МДФ Эмаль Матовый');
    await P(page, 400);
    
    const matPh2 = page.locator('input[placeholder*="Материал"], input[placeholder*="материал"]').first();
    if (await matPh2.isVisible().catch(() => false)) {
      await matPh2.fill('МДФ 18мм, эмаль');
      await P(page, 400);
    }
    
    await page.locator('input[placeholder*="₸"], input[placeholder*="цена"], input[placeholder*="Цена"]').first().fill('62000');
    await P(page, 400);
    
    await page.locator('button').filter({ hasText: /^Добавить$/ }).last().click();
    await P(page, 2500);
    console.log('Variant 2 added');
  }
  
  // Save KP
  const saveKP = page.getByRole('button', { name: /сохранить/i });
  if (await saveKP.isVisible()) {
    await saveKP.click();
    await P(page, 3000);
    console.log('KP saved');
  }
  
  await ctx.close();
  console.log('\n--- Phase 1 complete ---');
  
  // ═══════════════════════════════════════
  // PHASE 2: Record demos
  // ═══════════════════════════════════════
  const videos = [];
  
  // Demo 02: Dashboard
  {
    ctx = await browser.newContext({ viewport: VP, storageState: AUTH_STATE, recordVideo: { dir: REC, size: VP } });
    page = await ctx.newPage();
    console.log('\n=== Demo 02: Dashboard ===');
    await page.goto('https://kp.salamat-mebel.kz/dashboard', { waitUntil: 'networkidle' });
    await P(page, 4000);
    
    await page.getByRole('heading', { name: 'Главная' }).hover().catch(() => {});
    await P(page, 2000);
    await page.getByRole('link', { name: 'Новый клиент' }).hover().catch(() => {});
    await P(page, 2000);
    await page.getByRole('link', { name: 'Создать КП' }).hover().catch(() => {});
    await P(page, 2000);
    
    await page.getByRole('link', { name: 'Клиенты' }).click();
    await P(page, 3000);
    await page.getByRole('link', { name: 'Коммерческие предложения' }).click();
    await P(page, 3000);
    await page.getByRole('link', { name: 'Настройки' }).click();
    await P(page, 3000);
    await page.getByRole('link', { name: 'Обзор' }).click();
    await P(page, 3000);
    
    videos.push({ name: '02-dashboard', path: await page.video().path() });
    await ctx.close();
  }
  
  // Demo 03: New Client
  {
    ctx = await browser.newContext({ viewport: VP, storageState: AUTH_STATE, recordVideo: { dir: REC, size: VP } });
    page = await ctx.newPage();
    console.log('\n=== Demo 03: New Client ===');
    await page.goto('https://kp.salamat-mebel.kz/clients/new', { waitUntil: 'networkidle' });
    await P(page, 3000);
    
    await page.locator('#name').click(); await P(page, 800);
    await page.locator('#name').fill('Абдраимов Абик Абикович'); await P(page, 1500);
    await page.locator('#phone').click(); await P(page, 800);
    await page.locator('#phone').fill('+7 777 987 6543'); await P(page, 1500);
    await page.locator('#email').click(); await P(page, 800);
    await page.locator('#email').fill('abik@test.com'); await P(page, 1500);
    await page.locator('#notes').click(); await P(page, 800);
    await page.locator('#notes').fill('Демо-клиент для видео'); await P(page, 1500);
    
    await page.getByRole('button', { name: 'Сохранить' }).hover().catch(() => {});
    await P(page, 2000);
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await P(page, 4000);
    
    videos.push({ name: '03-new-client', path: await page.video().path() });
    await ctx.close();
  }
  
  // Demo 04: Client Card
  {
    ctx = await browser.newContext({ viewport: VP, storageState: AUTH_STATE, recordVideo: { dir: REC, size: VP } });
    page = await ctx.newPage();
    console.log('\n=== Demo 04: Client Card ===');
    await page.goto('https://kp.salamat-mebel.kz/clients', { waitUntil: 'networkidle' });
    await P(page, 3000);
    
    const cl = page.locator('main a[href^="/clients/"]').first();
    if (await cl.isVisible().catch(() => false)) {
      await cl.hover(); await P(page, 1500);
      await cl.click(); await P(page, 4000);
    }
    
    await page.mouse.wheel(0, 300); await P(page, 2000);
    await page.locator('#name').hover().catch(() => {}); await P(page, 2000);
    await page.mouse.wheel(0, 300); await P(page, 2000);
    
    videos.push({ name: '04-client-card', path: await page.video().path() });
    await ctx.close();
  }
  
  // Demo 05: New KP
  {
    ctx = await browser.newContext({ viewport: VP, storageState: AUTH_STATE, recordVideo: { dir: REC, size: VP } });
    page = await ctx.newPage();
    console.log('\n=== Demo 05: New KP ===');
    await page.goto('https://kp.salamat-mebel.kz/proposals/new', { waitUntil: 'networkidle' });
    await P(page, 3000);
    
    const cs = page.locator('select').first();
    if (await cs.isVisible()) {
      await cs.hover(); await P(page, 1000);
      if (await cs.locator('option').count() > 1) {
        await cs.selectOption({ index: 1 }); await P(page, 2000);
      }
    }
    
    await page.locator('#project_name').click(); await P(page, 800);
    await page.locator('#project_name').fill('Гардеробная комната'); await P(page, 2000);
    
    const dEl = page.locator('input[type="date"]').first();
    if (await dEl.isVisible()) { await dEl.click(); await P(page, 800); await dEl.fill('2026-09-01'); await P(page, 2000); }
    
    const aEl = page.locator('input[type="number"]').first();
    if (await aEl.isVisible()) { await aEl.click(); await P(page, 800); await aEl.fill('30'); await P(page, 2000); }
    
    await page.mouse.wheel(0, 300); await P(page, 1000);
    await page.getByRole('button', { name: 'Создать КП' }).hover().catch(() => {});
    await P(page, 2000);
    await page.getByRole('button', { name: 'Создать КП' }).click();
    await P(page, 5000);
    
    videos.push({ name: '05-new-kp', path: await page.video().path() });
    await ctx.close();
  }
  
  // Demo 06: Add Item
  {
    ctx = await browser.newContext({ viewport: VP, storageState: AUTH_STATE, recordVideo: { dir: REC, size: VP } });
    page = await ctx.newPage();
    console.log('\n=== Demo 06: Add Item ===');
    await page.goto(`https://kp.salamat-mebel.kz/proposals/${kpId}`, { waitUntil: 'networkidle' });
    await P(page, 4000);
    await page.mouse.wheel(0, 600); await P(page, 1500);
    
    const addBtn2 = page.getByRole('button', { name: /добавить позицию/i });
    if (await addBtn2.isVisible()) {
      await addBtn2.hover(); await P(page, 1500);
      await addBtn2.click(); await P(page, 1500);
      
      await page.locator('input[placeholder="Название позиции"]').click(); await P(page, 800);
      await page.locator('input[placeholder="Название позиции"]').fill('Шкаф-купе'); await P(page, 1500);
      
      await page.locator('input[placeholder*="×"]').click(); await P(page, 800);
      await page.locator('input[placeholder*="×"]').fill('2400×600×2200'); await P(page, 1500);
      
      // Quantity - find the number input in the item form area
      const itemNumInputs = page.locator('input[type="number"]');
      for (let i = 0; i < await itemNumInputs.count(); i++) {
        const el = itemNumInputs.nth(i);
        const ph = await el.getAttribute('placeholder');
        if (!ph || ph === '') {
          await el.click(); await P(page, 800);
          await el.fill('1'); await P(page, 1500);
          break;
        }
      }
      
      await page.locator('button').filter({ hasText: /^Добавить$/ }).last().hover();
      await P(page, 1500);
      await page.locator('button').filter({ hasText: /^Добавить$/ }).last().click();
      await P(page, 3000);
    }
    
    videos.push({ name: '06-add-item', path: await page.video().path() });
    await ctx.close();
  }
  
  // Demo 07: Add Variants
  {
    ctx = await browser.newContext({ viewport: VP, storageState: AUTH_STATE, recordVideo: { dir: REC, size: VP } });
    page = await ctx.newPage();
    console.log('\n=== Demo 07: Add Variants ===');
    await page.goto(`https://kp.salamat-mebel.kz/proposals/${kpId}`, { waitUntil: 'networkidle' });
    await P(page, 4000);
    await page.mouse.wheel(0, 600); await P(page, 1500);
    
    const addVB = page.getByRole('button', { name: /добавить вариант/i }).first();
    if (await addVB.isVisible()) {
      await addVB.hover(); await P(page, 1500);
      await addVB.click(); await P(page, 1500);
      
      await page.locator('input[placeholder*="название"]').last().click(); await P(page, 800);
      await page.locator('input[placeholder*="название"]').last().fill('Массив Дуба'); await P(page, 1500);
      
      const matEl = page.locator('input[placeholder*="Материал"], input[placeholder*="материал"]').first();
      if (await matEl.isVisible().catch(() => false)) {
        await matEl.click(); await P(page, 800);
        await matEl.fill('Массив дуба, лак'); await P(page, 1500);
      }
      
      await page.locator('input[placeholder*="₸"]').first().click(); await P(page, 800);
      await page.locator('input[placeholder*="₸"]').first().fill('85000'); await P(page, 1500);
      
      await page.locator('button').filter({ hasText: /^Добавить$/ }).last().hover();
      await P(page, 1500);
      await page.locator('button').filter({ hasText: /^Добавить$/ }).last().click();
      await P(page, 3000);
    }
    
    videos.push({ name: '07-add-variants', path: await page.video().path() });
    await ctx.close();
  }
  
  // Demo 08: Publish KP
  {
    ctx = await browser.newContext({ viewport: VP, storageState: AUTH_STATE, recordVideo: { dir: REC, size: VP } });
    page = await ctx.newPage();
    console.log('\n=== Demo 08: Publish KP ===');
    await page.goto(`https://kp.salamat-mebel.kz/proposals/${kpId}`, { waitUntil: 'networkidle' });
    await P(page, 4000);
    await page.mouse.wheel(0, 1200); await P(page, 2000);
    
    const pubBtn = page.getByRole('button', { name: /опубликовать/i });
    if (await pubBtn.isVisible()) {
      await pubBtn.hover(); await P(page, 2000);
      await pubBtn.click(); await P(page, 3000);
    }
    
    const cpBtn = page.getByRole('button', { name: /копировать/i });
    if (await cpBtn.isVisible()) {
      await cpBtn.hover(); await P(page, 1500);
      await cpBtn.click(); await P(page, 2000);
    }
    
    const waBtn = page.getByRole('button', { name: /whatsapp/i });
    if (await waBtn.isVisible()) {
      await waBtn.hover(); await P(page, 2000);
    }
    
    videos.push({ name: '08-publish-kp', path: await page.video().path() });
    await ctx.close();
  }
  
  // Demo 12: Settings
  {
    ctx = await browser.newContext({ viewport: VP, storageState: AUTH_STATE, recordVideo: { dir: REC, size: VP } });
    page = await ctx.newPage();
    console.log('\n=== Demo 12: Settings ===');
    await page.goto('https://kp.salamat-mebel.kz/settings', { waitUntil: 'networkidle' });
    await P(page, 4000);
    
    const allInputs = page.locator('input, textarea');
    const cnt = await allInputs.count();
    for (let i = 0; i < Math.min(cnt, 6); i++) {
      const el = allInputs.nth(i);
      if (await el.isVisible().catch(() => false)) {
        await el.hover(); await P(page, 1500);
      }
    }
    
    await page.mouse.wheel(0, 300); await P(page, 2000);
    
    videos.push({ name: '12-settings', path: await page.video().path() });
    await ctx.close();
  }
  
  await browser.close();
  
  console.log('\n\n═══════════════════════════════════════');
  console.log('RECORDINGS COMPLETE:');
  console.log('═══════════════════════════════════════');
  for (const v of videos) console.log(`${v.name}: ${v.path}`);
  console.log(`KP_ID=${kpId}`);
}

main().catch(err => { console.error(err); process.exit(1); });
