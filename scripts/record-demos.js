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

// ── Demo 02: Dashboard overview ──
async function demo02() {
  await recordDemo('02-dashboard', async (page) => {
    await page.goto('https://kp.salamat-mebel.kz/dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);

    // Hover stats area
    const heading = page.getByRole('heading', { name: 'Главная' });
    if (await heading.isVisible()) {
      await heading.hover();
      await page.waitForTimeout(2000);
    }

    // Hover "Новый клиент" button
    const newClientBtn = page.getByRole('link', { name: 'Новый клиент' });
    if (await newClientBtn.isVisible()) {
      await newClientBtn.hover();
      await page.waitForTimeout(2000);
    }

    // Hover "Создать КП" button
    const newKpBtn = page.getByRole('link', { name: 'Создать КП' });
    if (await newKpBtn.isVisible()) {
      await newKpBtn.hover();
      await page.waitForTimeout(2000);
    }

    // Navigate to Clients
    const clientsNav = page.getByRole('link', { name: 'Клиенты' });
    if (await clientsNav.isVisible()) {
      await clientsNav.hover();
      await page.waitForTimeout(1500);
      await clientsNav.click();
      await page.waitForTimeout(3000);
    }

    // Navigate to KP list
    const kpNav = page.getByRole('link', { name: 'Коммерческие предложения' });
    if (await kpNav.isVisible()) {
      await kpNav.hover();
      await page.waitForTimeout(1500);
      await kpNav.click();
      await page.waitForTimeout(3000);
    }

    // Navigate to Settings
    const settingsNav = page.getByRole('link', { name: 'Настройки' });
    if (await settingsNav.isVisible()) {
      await settingsNav.hover();
      await page.waitForTimeout(1500);
      await settingsNav.click();
      await page.waitForTimeout(3000);
    }

    // Back to dashboard
    const homeNav = page.getByRole('link', { name: 'Обзор' });
    if (await homeNav.isVisible()) {
      await homeNav.click();
      await page.waitForTimeout(3000);
    }

    await page.waitForTimeout(2000);
  });
}

// ── Demo 03: Create new client ──
async function demo03() {
  await recordDemo('03-new-client', async (page) => {
    await page.goto('https://kp.salamat-mebel.kz/clients', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Click "Новый клиент"
    const newClientBtn = page.getByRole('link', { name: 'Новый клиент' }).first();
    if (await newClientBtn.isVisible()) {
      await newClientBtn.hover();
      await page.waitForTimeout(1500);
      await newClientBtn.click();
      await page.waitForTimeout(3000);
    }

    // Fill client name
    const nameInput = page.getByLabel(/имя клиента/i);
    if (await nameInput.isVisible()) {
      await nameInput.click();
      await page.waitForTimeout(800);
      await nameInput.fill('Тестов Тест Тестович');
      await page.waitForTimeout(1500);
    }

    // Fill phone
    const phoneInput = page.getByLabel(/телефон/i);
    if (await phoneInput.isVisible()) {
      await phoneInput.click();
      await page.waitForTimeout(800);
      await phoneInput.fill('+7 700 123 4567');
      await page.waitForTimeout(1500);
    }

    // Fill email
    const emailInput = page.getByLabel(/email/i);
    if (await emailInput.isVisible()) {
      await emailInput.click();
      await page.waitForTimeout(800);
      await emailInput.fill('test@example.com');
      await page.waitForTimeout(1500);
    }

    // Fill notes
    const notesInput = page.getByLabel(/примечание/i);
    if (await notesInput.isVisible()) {
      await notesInput.click();
      await page.waitForTimeout(800);
      await notesInput.fill('Тестовый клиент для демонстрации');
      await page.waitForTimeout(1500);
    }

    // Save
    const saveBtn = page.getByRole('button', { name: /сохранить/i });
    if (await saveBtn.isVisible()) {
      await saveBtn.hover();
      await page.waitForTimeout(2000);
      await saveBtn.click();
      await page.waitForTimeout(4000);
    }
  });
}

// ── Demo 04: View client card ──
async function demo04() {
  await recordDemo('04-client-card', async (page) => {
    await page.goto('https://kp.salamat-mebel.kz/clients', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Click first client
    const clientCards = page.locator('main a[href^="/clients/"]');
    const count = await clientCards.count();
    if (count > 0) {
      await clientCards.first().hover();
      await page.waitForTimeout(1500);
      await clientCards.first().click();
      await page.waitForTimeout(4000);
    }

    // Scroll down
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(2000);

    // Hover name field
    const nameInput = page.getByLabel(/имя/i);
    if (await nameInput.isVisible()) {
      await nameInput.hover();
      await page.waitForTimeout(2000);
    }

    // Scroll more
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(2000);

    await page.waitForTimeout(2000);
  });
}

// ── Demo 05: Create KP from scratch ──
async function demo05() {
  await recordDemo('05-new-kp', async (page) => {
    await page.goto('https://kp.salamat-mebel.kz/proposals', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Click "Создать КП"
    const newKpBtn = page.getByRole('link', { name: 'Создать КП' }).first();
    if (await newKpBtn.isVisible()) {
      await newKpBtn.hover();
      await page.waitForTimeout(1500);
      await newKpBtn.click();
      await page.waitForTimeout(3000);
    }

    // Select client
    const clientSelect = page.getByLabel(/клиент/i);
    if (await clientSelect.isVisible()) {
      await clientSelect.click();
      await page.waitForTimeout(1000);
      await clientSelect.selectOption({ index: 1 });
      await page.waitForTimeout(2000);
    }

    // Fill project name
    const projectInput = page.getByLabel(/название проекта/i);
    if (await projectInput.isVisible()) {
      await projectInput.click();
      await page.waitForTimeout(800);
      await projectInput.fill('Кухня в стиле минимализм');
      await page.waitForTimeout(1500);
    }

    // Fill valid until
    const dateInput = page.getByLabel(/срок действия/i);
    if (await dateInput.isVisible()) {
      await dateInput.click();
      await page.waitForTimeout(800);
      await dateInput.fill('2026-08-15');
      await page.waitForTimeout(1500);
    }

    // Fill advance percent
    const advanceInput = page.getByLabel(/аванс/i);
    if (await advanceInput.isVisible()) {
      await advanceInput.click();
      await page.waitForTimeout(800);
      await advanceInput.fill('50');
      await page.waitForTimeout(1500);
    }

    // Hover and save
    const saveBtn = page.getByRole('button', { name: /сохранить/i });
    if (await saveBtn.isVisible()) {
      await saveBtn.hover();
      await page.waitForTimeout(2000);
      await saveBtn.click();
      await page.waitForTimeout(4000);
    }
  });
}

// ── Demo 06: Add furniture item with details ──
async function demo06() {
  await recordDemo('06-add-item', async (page) => {
    // Go to proposals and open first KP
    await page.goto('https://kp.salamat-mebel.kz/proposals', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const kpLink = page.locator('main a[href^="/proposals/"]').first();
    if (await kpLink.isVisible()) {
      await kpLink.hover();
      await page.waitForTimeout(1500);
      await kpLink.click();
      await page.waitForTimeout(4000);
    }

    // Scroll to items section
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(2000);

    // Click "Добавить позицию"
    const addItemBtn = page.getByRole('button', { name: /добавить позицию/i });
    if (await addItemBtn.isVisible()) {
      await addItemBtn.hover();
      await page.waitForTimeout(1500);
      await addItemBtn.click();
      await page.waitForTimeout(1500);
    }

    // Fill item name
    const itemName = page.getByLabel(/название позиции/i);
    if (await itemName.isVisible()) {
      await itemName.click();
      await page.waitForTimeout(800);
      await itemName.fill('Кухонный шкаф верхний');
      await page.waitForTimeout(1500);
    }

    // Fill dimensions
    const dims = page.getByLabel(/размер/i);
    if (await dims.isVisible()) {
      await dims.click();
      await page.waitForTimeout(800);
      await dims.fill('800×350×720');
      await page.waitForTimeout(1500);
    }

    // Fill quantity
    const qty = page.getByLabel(/кол-во/i);
    if (await qty.isVisible()) {
      await qty.click();
      await page.waitForTimeout(800);
      await qty.fill('2');
      await page.waitForTimeout(1500);
    }

    // Save item
    const saveItemBtn = page.getByRole('button', { name: /^Добавить$/i });
    if (await saveItemBtn.isVisible()) {
      await saveItemBtn.hover();
      await page.waitForTimeout(2000);
      await saveItemBtn.click();
      await page.waitForTimeout(3000);
    }

    // Now add a variant — click "Добавить вариант"
    const addVariantBtn = page.getByRole('button', { name: /добавить вариант/i });
    if (await addVariantBtn.isVisible()) {
      await addVariantBtn.hover();
      await page.waitForTimeout(1500);
      await addVariantBtn.click();
      await page.waitForTimeout(1500);
    }

    // Fill variant name
    const varName = page.getByLabel(/название варианта/i);
    if (await varName.isVisible()) {
      await varName.click();
      await page.waitForTimeout(800);
      await varName.fill('ЛДСП Белый глянец');
      await page.waitForTimeout(1500);
    }

    // Fill material
    const material = page.getByLabel(/материал/i);
    if (await material.isVisible()) {
      await material.click();
      await page.waitForTimeout(800);
      await material.fill('ЛДСП 18мм, белый глянец');
      await page.waitForTimeout(1500);
    }

    // Fill price
    const price = page.getByLabel(/цена/i);
    if (await price.isVisible()) {
      await price.click();
      await page.waitForTimeout(800);
      await price.fill('45000');
      await page.waitForTimeout(1500);
    }

    // Save variant
    const saveVarBtn = page.getByRole('button', { name: /^Добавить$/i }).last();
    if (await saveVarBtn.isVisible()) {
      await saveVarBtn.hover();
      await page.waitForTimeout(2000);
      await saveVarBtn.click();
      await page.waitForTimeout(3000);
    }

    await page.waitForTimeout(2000);
  });
}

// ── Main ──
const demos = { '2': demo02, '3': demo03, '4': demo04, '5': demo05, '6': demo06 };
const num = process.argv[2];
if (!num || !demos[num]) {
  console.log('Usage: node record-demos.js <number>');
  console.log('Available: 2, 3, 4, 5, 6');
  process.exit(1);
}
demos[num]().then(() => console.log(`Demo ${num} complete.`)).catch(err => { console.error(err); process.exit(1); });
