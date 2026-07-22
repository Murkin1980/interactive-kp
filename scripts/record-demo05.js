const { chromium } = require('playwright');

const AUTH_STATE = 'C:\\tmp\\interactive-kp-demo-auth.json';
const RECORDINGS_DIR = 'C:\\Users\\Мурат\\OneDrive\\Documents\\Interactive Offer\\interactive-kp\\public\\demos\\recordings';
const SLOW_MO = 300;
const VIEWPORT = { width: 1440, height: 900 };

async function recordDemo(name, actions) {
  const browser = await chromium.launch({ headless: false, slowMo: SLOW_MO });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    storageState: AUTH_STATE,
    recordVideo: { dir: RECORDINGS_DIR, size: VIEWPORT },
  });
  const page = await context.newPage();
  try {
    await actions(page);
  } catch (err) {
    console.error(`[${name}] ERROR:`, err.message);
  } finally {
    await page.waitForTimeout(2000);
    const videoPath = await page.video().path();
    await context.close();
    await browser.close();
    console.log(`[${name}] Saved: ${videoPath}`);
  }
}

// ── Demo 05: Create KP from scratch ──
async function demo05() {
  await recordDemo('05-new-kp', async (page) => {
    await page.goto('https://kp.salamat-mebel.kz/proposals/new', { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);

    // Select client from dropdown
    const clientSelect = page.locator('#client_id');
    if (await clientSelect.isVisible()) {
      await clientSelect.hover();
      await page.waitForTimeout(1000);
      const options = await clientSelect.locator('option').all();
      console.log(`Found ${options.length} client options`);
      if (options.length > 1) {
        await clientSelect.selectOption({ index: 1 });
        await page.waitForTimeout(2000);
      }
    }

    // Fill project name
    const projectInput = page.locator('#project_name');
    if (await projectInput.isVisible()) {
      await projectInput.click();
      await page.waitForTimeout(800);
      await projectInput.fill('Кухня в стиле минимализм');
      await page.waitForTimeout(2000);
    }

    // Fill valid until
    const dateInput = page.locator('#valid_until');
    if (await dateInput.isVisible()) {
      await dateInput.click();
      await page.waitForTimeout(800);
      await dateInput.fill('2026-08-15');
      await page.waitForTimeout(2000);
    }

    // Fill advance percent
    const advanceInput = page.locator('#advance_percent');
    if (await advanceInput.isVisible()) {
      await advanceInput.click();
      await page.waitForTimeout(800);
      await advanceInput.fill('50');
      await page.waitForTimeout(2000);
    }

    // Scroll down to see save button
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(1500);

    // Hover and click "Создать КП"
    const saveBtn = page.getByRole('button', { name: 'Создать КП' });
    if (await saveBtn.isVisible()) {
      await saveBtn.hover();
      await page.waitForTimeout(2000);
      await saveBtn.click();
      await page.waitForTimeout(5000);
    }

    // Now we should be on the KP detail page
    await page.waitForTimeout(3000);
  });
}

// ── Main ──
demo05().then(() => console.log('Demo 05 complete.')).catch(err => { console.error(err); process.exit(1); });
