const { chromium } = require('playwright');
const AUTH_STATE = 'C:\\tmp\\interactive-kp-demo-auth.json';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: AUTH_STATE,
  });
  const page = await context.newPage();
  
  await page.goto('https://kp.salamat-mebel.kz/proposals/new', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  // Print the page content
  const html = await page.content();
  console.log('URL:', page.url());
  
  // Find all form elements
  const inputs = await page.locator('input, select, textarea, button').all();
  for (const el of inputs) {
    const tag = await el.evaluate(e => e.tagName);
    const type = await el.getAttribute('type');
    const id = await el.getAttribute('id');
    const name = await el.getAttribute('name');
    const label = await el.evaluate(e => {
      const l = e.closest('label') || (e.id && document.querySelector(`label[for="${e.id}"]`));
      return l ? l.textContent.trim() : '';
    });
    const text = await el.textContent().catch(() => '');
    console.log(`${tag} type=${type} id=${id} name=${name} label="${label}" text="${text?.slice(0,50)}"`);
  }
  
  await browser.close();
})();
