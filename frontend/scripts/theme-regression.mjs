// Isolated browser checks; never changes the user's stored theme or notes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BEMO_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', reducedMotion: 'reduce' });
const page = await context.newPage();
await context.route('**/api/**', route => route.fulfill({ json: [] }));
const output = process.env.BEMO_UX_OUTPUT_DIR;
if (output) await mkdir(output, { recursive: true });
try {
  await page.goto(process.env.BEMO_UX_BASE_URL || 'http://127.0.0.1:5173');
  await page.waitForSelector('html.theme-cream');
  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  await page.locator('.settings-nav').getByRole('button', { name: /外观/ }).click();
  const cream = page.getByRole('button', { name: '奶油 (Cream)', exact: true });
  assert.equal(await cream.getAttribute('aria-pressed'), 'true');
  const dark = page.getByRole('checkbox', { name: '深色模式', exact: true });
  for (const mode of ['light', 'dark']) {
    await dark.setChecked(mode === 'dark');
    assert.equal(await page.locator('html').evaluate(el => el.classList.contains('dark')), mode === 'dark');
    const colors = await page.locator('html').evaluate(el => {
      const css = getComputedStyle(el);
      return Object.fromEntries(['--bg-main', '--accent-color', '--accent-text', '--accent-foreground'].map(key => [key, css.getPropertyValue(key).trim()]));
    });
    assert.equal(colors['--bg-main'], mode === 'light' ? '#f8f6f0' : '#201f1c');
    console.log(mode, colors);
    await page.getByRole('dialog', { name: '设置', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '打开设置', exact: true }).click();
    await page.locator('.settings-nav').getByRole('button', { name: /外观/ }).click();
    if (output) await page.screenshot({ path: path.join(output, `cream-${mode}.png`), fullPage: true, animations: 'disabled' });
  }
  for (const [label, skin] of [['经典配色 (Bemo)', 'default'], ['极区冰川 (Nord)', 'nord'], ['书卷拿铁 (Sepia)', 'sepia'], ['奶油 (Cream)', 'cream']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem('theme-skin')), skin);
    assert.deepEqual(await page.locator('html').evaluate(el => [...el.classList].filter(c => c.startsWith('theme-'))), skin === 'default' ? [] : [`theme-${skin}`]);
  }
  await page.reload();
  await page.waitForSelector('html.theme-cream.dark');
  console.log('PASS theme controls, computed palette, persistence and theme class cleanup');
} finally {
  await browser.close();
}
