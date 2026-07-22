const { chromium } = require('playwright');
const AUTH_STATE = 'C:\\tmp\\interactive-kp-demo-auth.json';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: AUTH_STATE });
  const page = await ctx.newPage();
  
  // Check clients/new
  await page.goto('https://kp.salamat-mebel.kz/clients/new', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  console.log('=== /clients/new ===');
  console.log('URL:', page.url());
  
  const inputs1 = await page.locator('input, select, textarea, button').all();
  for (const el of inputs1) {
    const tag = await el.evaluate(e => e.tagName);
    const id = await el.getAttribute('id');
    const ph = await el.getAttribute('placeholder');
    const text = await el.textContent().catch(() => '');
    console.log(`  ${tag} id=${id} placeholder=${ph} text="${(text||'').slice(0,40)}"`);
  }
  
  // Check proposals
  await page.goto('https://kp.salamat-mebel.kz/proposals', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  console.log('\n=== /proposals ===');
  console.log('URL:', page.url());
  const links1 = await page.locator('main a').all();
  for (const l of links1) {
    const href = await l.getAttribute('href');
    const text = await l.textContent();
    console.log(`  a href=${href} text="${(text||'').slice(0,40)}"`);
  }
  
  await browser.close();
})();
