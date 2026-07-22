const { chromium } = require('playwright');
const AUTH_STATE = 'C:\\tmp\\interactive-kp-demo-auth.json';
const KP_ID = '5d9222b9-7665-48ab-a0c1-299151545d65';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: AUTH_STATE });
  const page = await ctx.newPage();
  
  await page.goto(`https://kp.salamat-mebel.kz/proposals/${KP_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  // Scroll to items
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(1000);
  
  // Click add item
  const addBtn = page.getByRole('button', { name: /добавить позицию/i });
  if (await addBtn.isVisible()) {
    await addBtn.click();
    await page.waitForTimeout(1500);
  }
  
  // List ALL inputs in the item form area
  const allInputs = await page.locator('input, select, textarea').all();
  console.log(`Total inputs on page: ${allInputs.length}`);
  for (let i = 0; i < allInputs.length; i++) {
    const el = allInputs[i];
    const tag = await el.evaluate(e => e.tagName);
    const type = await el.getAttribute('type');
    const id = await el.getAttribute('id');
    const name = await el.getAttribute('name');
    const placeholder = await el.getAttribute('placeholder');
    const cls = await el.getAttribute('class');
    const visible = await el.isVisible();
    const labels = await el.evaluate(e => {
      const l = e.labels;
      if (l && l.length > 0) return Array.from(l).map(x => x.textContent.trim()).join(', ');
      const closest = e.closest('label');
      return closest ? closest.textContent.trim() : '';
    });
    console.log(`  [${i}] ${tag} type=${type} id=${id} name=${name} placeholder="${placeholder}" labels="${labels}" visible=${visible} class="${(cls||'').slice(0,50)}"`);
  }
  
  await browser.close();
})();
