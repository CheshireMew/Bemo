import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BEMO_PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.env.BEMO_MOBILE_UX_BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
await context.addInitScript(() => {
  window.androidBridge = {};
});
const page = await context.newPage();
const errors = [];
const regressionNoteText = `手机触控回归笔记-${Date.now()}`;
page.on('pageerror', error => errors.push(error.message));

const swipe = async (locator, from, to, pointerId) => {
  const eventBase = { pointerId, pointerType: 'touch', isPrimary: true, button: 0 };
  await locator.dispatchEvent('pointerdown', { ...eventBase, clientX: from.x, clientY: from.y });
  await locator.dispatchEvent('pointermove', {
    ...eventBase,
    clientX: from.x + (to.x - from.x) * 0.45,
    clientY: from.y + (to.y - from.y) * 0.45,
  });
  await locator.dispatchEvent('pointermove', { ...eventBase, clientX: to.x, clientY: to.y });
  await locator.dispatchEvent('pointerup', { ...eventBase, clientX: to.x, clientY: to.y });
};

try {
  await page.goto(baseUrl);
  await page.locator('.mobile-shell').waitFor();
  assert.equal(await page.locator('html').evaluate(element => element.classList.contains('bemo-mobile')), true);

  const bottomButtons = page.locator('.mobile-bottom-nav .nav-btn');
  for (let index = 0; index < await bottomButtons.count(); index += 1) {
    const box = await bottomButtons.nth(index).boundingBox();
    assert.ok(box && box.height >= 44 && box.width >= 44, `bottom navigation target ${index} is too small`);
  }

  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  const settingsDialog = page.getByRole('dialog', { name: '设置', exact: true });
  await settingsDialog.waitFor();
  const settingsItems = settingsDialog.locator('.settings-index-item');
  assert.equal(await settingsItems.count(), 7, 'mobile settings should expose all mobile categories without a tab scroller');
  for (let index = 0; index < await settingsItems.count(); index += 1) {
    const box = await settingsItems.nth(index).boundingBox();
    assert.ok(box && box.height >= 44 && box.width >= 44, `settings target ${index} is too small`);
  }
  await settingsItems.first().click();
  await settingsDialog.getByRole('button', { name: '返回设置首页', exact: true }).waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event('bemoBackButton')));
  await settingsDialog.locator('.settings-index').waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event('bemoBackButton')));
  await settingsDialog.waitFor({ state: 'hidden' });

  await page.getByRole('button', { name: '打开导航', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: '导航', exact: true });
  await drawer.waitFor();
  const drawerBox = await drawer.boundingBox();
  assert.ok(drawerBox && drawerBox.width < 390 && drawerBox.width >= 300, `unexpected drawer width ${drawerBox?.width}`);
  await swipe(drawer, { x: 290, y: 420 }, { x: 130, y: 424 }, 11);
  await drawer.waitFor({ state: 'hidden' });

  await page.getByRole('button', { name: '记录', exact: true }).click();
  const compose = page.getByRole('dialog', { name: '快速记录', exact: true });
  await compose.waitFor();
  const editorToolbarButtons = compose.locator('.editor-toolbar button');
  for (let index = 0; index < await editorToolbarButtons.count(); index += 1) {
    const box = await editorToolbarButtons.nth(index).boundingBox();
    assert.ok(box && box.height >= 44 && box.width >= 44, `editor target ${index} is too small`);
  }
  await swipe(compose.locator('.sheet-header'), { x: 190, y: 80 }, { x: 190, y: 230 }, 12);
  await compose.waitFor({ state: 'hidden' });

  await page.getByRole('button', { name: '记录', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '快速记录', exact: true });
  const markdownInput = editor.locator('textarea.editor-input');
  if (await markdownInput.isVisible()) {
    await markdownInput.fill(regressionNoteText);
  } else {
    await editor.locator('.editor-preview').fill(regressionNoteText);
  }
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  const noteCard = page.locator('.mobile-note-card').filter({ hasText: regressionNoteText });
  await noteCard.waitFor({ timeout: 8000 });
  const noteActions = noteCard.locator('.note-actions .btn-action');
  assert.equal(await noteActions.count(), 4, 'mobile note actions should be directly visible');
  for (let index = 0; index < await noteActions.count(); index += 1) {
    const box = await noteActions.nth(index).boundingBox();
    assert.ok(box && box.height >= 38 && box.width >= 38, `note action ${index} is too small`);
  }
  assert.equal(await noteCard.locator('.action-sheet').count(), 0, 'mobile note actions should not use an overflow sheet');

  assert.deepEqual(errors, [], `browser errors: ${errors.join('\n')}`);
  console.log('mobile touch regression passed');
} catch (error) {
  console.error('Browser errors:', errors);
  console.error('Visible notifications:', await page.locator('.notification').allInnerTexts().catch(() => []));
  console.error('Visible page text:', (await page.locator('body').innerText().catch(() => '')).slice(0, 1600));
  throw error;
} finally {
  await context.close();
  await browser.close();
}
