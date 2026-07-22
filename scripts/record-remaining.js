const { chromium } = require('playwright');

const AUTH = 'C:\\tmp\\interactive-kp-demo-auth.json';
const REC = 'C:\\Users\\Мурат\\OneDrive\\Documents\\Interactive Offer\\interactive-kp\\public\\demos\\recordings';
const SLOW = 300;
const P = async (pg, ms) => pg.waitForTimeout(ms);
const VP = { width: 1440, height: 900 };

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: SLOW });

  // ═══ Phase 1: Create fresh KP and publish it ═══
  console.log('--- Phase 1: Create & publish KP ---');
  let ctx = await browser.newContext({ viewport: VP, storageState: AUTH });
  let page = await ctx.newPage();

  // Create client
  await page.goto('https://kp.salamat-mebel.kz/clients/new', { waitUntil: 'networkidle' });
  await P(page, 2000);
  await page.locator('#name').fill('Демо Клиент'); await P(page, 300);
  await page.locator('#phone').fill('+7 700 111 2233'); await P(page, 300);
  await page.locator('#email').fill('demo@test.com'); await P(page, 300);
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await P(page, 3000);
  console.log('Client created');

  // Create KP
  await page.goto('https://kp.salamat-mebel.kz/proposals/new', { waitUntil: 'networkidle' });
  await P(page, 2000);
  const sel = page.locator('select').first();
  if (await sel.locator('option').count() > 1) { await sel.selectOption({ index: 1 }); await P(page, 1000); }
  await page.locator('#project_name').fill('Демо Кухня'); await P(page, 300);
  const dateEl = page.locator('input[type="date"]').first();
  if (await dateEl.isVisible()) { await dateEl.fill('2026-08-30'); await P(page, 300); }
  await page.getByRole('button', { name: 'Создать КП' }).click();
  await P(page, 4000);
  const kpId = page.url().split('/').pop();
  console.log('KP created:', kpId);

  // Scroll to items
  await page.mouse.wheel(0, 600); await P(page, 1500);

  // Add item
  const addBtn = page.getByRole('button', { name: /добавить позицию/i });
  if (await addBtn.isVisible()) {
    await addBtn.click(); await P(page, 1500);
    await page.locator('input[placeholder="Название позиции"]').fill('Кухонный гарнитур'); await P(page, 300);
    await page.locator('input[placeholder*="×"]').fill('3000×600×850'); await P(page, 300);
    // Quantity: find visible number input without placeholder
    const numInputs = page.locator('input[type="number"]');
    for (let i = 0; i < await numInputs.count(); i++) {
      const el = numInputs.nth(i);
      const ph = await el.getAttribute('placeholder');
      if (!ph) { await el.fill('1'); await P(page, 300); break; }
    }
    // Click Add button for the item
    await page.locator('button').filter({ hasText: /^Добавить$/ }).last().click();
    await P(page, 2500);
    console.log('Item added');
  }

  // Add variant 1
  const addV1 = page.getByRole('button', { name: /добавить вариант/i }).first();
  if (await addV1.isVisible()) {
    await addV1.click(); await P(page, 1500);
    const nameInputs = page.locator('input[placeholder*="название"]');
    await nameInputs.last().fill('ЛДСП Белый'); await P(page, 300);
    const matEl = page.locator('input[placeholder*="Материал"], input[placeholder*="материал"]').first();
    if (await matEl.isVisible().catch(() => false)) { await matEl.fill('ЛДСП 18мм'); await P(page, 300); }
    await page.locator('input[placeholder*="₸"]').first().fill('55000'); await P(page, 300);
    await page.locator('button').filter({ hasText: /^Добавить$/ }).last().click();
    await P(page, 2500);
    console.log('Variant 1 added');
  }

  // Add variant 2
  const addV2 = page.getByRole('button', { name: /добавить вариант/i }).first();
  if (await addV2.isVisible()) {
    await addV2.click(); await P(page, 1500);
    const nameInputs = page.locator('input[placeholder*="название"]');
    await nameInputs.last().fill('МДФ Эмаль'); await P(page, 300);
    const matEl = page.locator('input[placeholder*="Материал"], input[placeholder*="материал"]').first();
    if (await matEl.isVisible().catch(() => false)) { await matEl.fill('МДФ 18мм'); await P(page, 300); }
    await page.locator('input[placeholder*="₸"]').first().fill('78000'); await P(page, 300);
    await page.locator('button').filter({ hasText: /^Добавить$/ }).last().click();
    await P(page, 2500);
    console.log('Variant 2 added');
  }

  // Save
  const saveBtn = page.getByRole('button', { name: /сохранить/i });
  if (await saveBtn.isVisible()) { await saveBtn.click(); await P(page, 3000); console.log('KP saved'); }

  // Publish
  await page.mouse.wheel(0, 1500); await P(page, 2000);
  const pubBtn = page.getByRole('button', { name: /опубликовать/i });
  if (await pubBtn.isVisible().catch(() => false)) {
    await pubBtn.click(); await P(page, 3000);
    console.log('KP published');
  }

  // Extract public URL from page
  const content = await page.content();
  const match = content.match(/\/public\/([a-f0-9-]+)/);
  const publicUrl = match ? `https://kp.salamat-mebel.kz/public/${match[1]}` : '';
  console.log('Public URL:', publicUrl);
  await ctx.close();

  if (!publicUrl) {
    console.log('ERROR: No public URL found');
    await browser.close();
    return;
  }

  // ═══ Phase 2: Record demos ═══
  
  // Demo 09: Client mobile view (390×844)
  {
    const mvp = { width: 390, height: 844 };
    ctx = await browser.newContext({ viewport: mvp, storageState: AUTH, recordVideo: { dir: REC, size: mvp } });
    page = await ctx.newPage();
    console.log('\n=== Demo 09: Client Mobile ===');
    await page.goto(publicUrl, { waitUntil: 'networkidle' }); await P(page, 4000);
    
    // Scroll through the proposal
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 250); await P(page, 1200); }
    
    // Select variant
    const radio = page.locator('input[type="radio"]').first();
    if (await radio.isVisible().catch(() => false)) { await radio.click(); await P(page, 2000); }
    
    await P(page, 2000);
    console.log('Recorded: 09-client-mobile ->', await page.video().path());
    await ctx.close();
  }

  // Demo 10: Desktop confirm
  {
    ctx = await browser.newContext({ viewport: VP, storageState: AUTH, recordVideo: { dir: REC, size: VP } });
    page = await ctx.newPage();
    console.log('\n=== Demo 10: Client Confirm ===');
    await page.goto(publicUrl, { waitUntil: 'networkidle' }); await P(page, 4000);
    
    // Select variants
    const radios = page.locator('input[type="radio"]');
    for (let i = 0; i < await radios.count(); i++) {
      await radios.nth(i).click(); await P(page, 800);
    }
    await page.mouse.wheel(0, 500); await P(page, 2000);
    
    const confirmBtn = page.getByRole('button', { name: /подтвердить/i });
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.hover(); await P(page, 1500);
      await confirmBtn.click(); await P(page, 5000);
    }
    await P(page, 3000);
    console.log('Recorded: 10-client-confirm ->', await page.video().path());
    await ctx.close();
  }

  // Demo 11: Manager unlock
  {
    ctx = await browser.newContext({ viewport: VP, storageState: AUTH, recordVideo: { dir: REC, size: VP } });
    page = await ctx.newPage();
    console.log('\n=== Demo 11: Manager Unlock ===');
    await page.goto(`https://kp.salamat-mebel.kz/proposals/${kpId}`, { waitUntil: 'networkidle' }); await P(page, 4000);
    await page.mouse.wheel(0, 1200); await P(page, 2000);
    
    const unlockBtn = page.getByRole('button', { name: /разблокировать/i });
    if (await unlockBtn.isVisible().catch(() => false)) {
      await unlockBtn.hover(); await P(page, 1500);
      await unlockBtn.click(); await P(page, 3000);
    } else {
      console.log('No unlock button - showing confirmed state');
      // Show status badge and read-only state
      await page.mouse.wheel(0, -400); await P(page, 2000);
      await page.mouse.wheel(0, 400); await P(page, 2000);
    }
    await P(page, 2000);
    console.log('Recorded: 11-manager-unlock ->', await page.video().path());
    await ctx.close();
  }

  // Demo 12: Settings
  {
    ctx = await browser.newContext({ viewport: VP, storageState: AUTH, recordVideo: { dir: REC, size: VP } });
    page = await ctx.newPage();
    console.log('\n=== Demo 12: Settings ===');
    await page.goto('https://kp.salamat-mebel.kz/settings', { waitUntil: 'networkidle' }); await P(page, 4000);
    
    const textInputs = page.locator('input:not([type="file"]):not([type="hidden"]):not([type="number"]):not([type="date"]):not([type="checkbox"]):not([type="radio"]), textarea');
    for (let i = 0; i < Math.min(await textInputs.count(), 8); i++) {
      const el = textInputs.nth(i);
      if (await el.isVisible().catch(() => false)) { await el.hover(); await P(page, 1500); }
    }
    await page.mouse.wheel(0, 300); await P(page, 2000);
    await page.mouse.wheel(0, 300); await P(page, 2000);
    console.log('Recorded: 12-settings ->', await page.video().path());
    await ctx.close();
  }

  await browser.close();
  console.log('\n=== All done ===');
}

main().catch(err => { console.error(err); process.exit(1); });
