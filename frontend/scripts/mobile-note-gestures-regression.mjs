// Isolated local storage and a mocked native clipboard; no real app data is changed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BEMO_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
await context.addInitScript(() => {
  window.androidBridge = {};
  window.__BEMO_RUNTIME_CONFIG__ = { appStorageMode: 'local' };
  window.copiedNotes = [];
  window.Capacitor = {
    PluginHeaders: [{ name: 'NativeHost', methods: [{ name: 'copyToClipboard', rtype: 'promise' }] }],
    nativePromise: async (plugin, method, payload) => {
      if (plugin === 'NativeHost' && method === 'copyToClipboard') window.copiedNotes.push(payload);
    },
  };
});
await context.route('**/api/**', route => route.abort());
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const touch = await context.newCDPSession(page);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const useStore = (module, fn) => page.evaluate(async ({ module, fn }) => {
  const modulePath = `/src/${module}.ts`;
  const loadedUrl = performance.getEntriesByType('resource').findLast(entry => new URL(entry.name).pathname === modulePath)?.name;
  const store = await import(loadedUrl || modulePath);
  return Function('store', `return (${fn})(store)`)(store);
}, { module, fn: fn.toString() });
const pointIn = async locator => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  assert.ok(box);
  return { x: box.x + Math.min(box.width / 2, 170), y: box.y + Math.min(box.height / 2, 15) };
};
const touchAt = (type, point) => touch.send('Input.dispatchTouchEvent', {
  type,
  touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ ...point, id: 1 }],
});
const tap = async point => {
  await touchAt('touchStart', point);
  await touchAt('touchEnd', point);
};
const drag = async (locator, deltaX, deltaY = 0) => {
  const from = await pointIn(locator);
  await touchAt('touchStart', from);
  for (let step = 1; step <= 6; step++) {
    await pause(35);
    await touchAt('touchMove', { x: from.x + deltaX * step / 6, y: from.y + deltaY * step / 6 });
  }
  await touchAt('touchEnd', { x: from.x + deltaX, y: from.y + deltaY });
};
const copyCount = () => page.evaluate(() => window.copiedNotes.length);
const card = page.locator('.mobile-note-card').filter({ hasText: '手势回归笔记' });
const text = card.locator('.note-body p').first();
const editDialog = page.getByRole('dialog', { name: '编辑笔记', exact: true });

try {
  await page.goto(process.env.BEMO_MOBILE_UX_BASE_URL || 'http://127.0.0.1:5173');
  await page.locator('.mobile-shell').waitFor();
  await useStore('store/notes', async store => {
    for (let index = 0; index < 12; index++) {
      await store.createNoteContent({ content: `滚动辅助笔记 ${index}\n\n保留正常的上下滚动。`, tags: [] });
    }
    await store.createNoteContent({ content: '手势回归笔记\n\n第二段正文。\n\n[链接](https://example.com)', tags: [] });
  });
  await text.waitFor();

  const initialPoint = await pointIn(text);
  await tap(initialPoint);
  await pause(400);
  assert.equal(await editDialog.count(), 0, 'single tap must not edit');
  await tap(initialPoint);
  await pause(80);
  await tap(initialPoint);
  await editDialog.waitFor();
  const editor = editDialog.locator('.editor-preview');
  await editor.fill('手势回归笔记，已通过双击修改\n\n[链接](https://example.com)');
  await editDialog.getByRole('button', { name: '保存', exact: true }).click();
  await editDialog.waitFor({ state: 'hidden' });
  await card.getByText('手势回归笔记，已通过双击修改', { exact: true }).waitFor();
  console.log('PASS double tap opens editor and saves changes; single tap does nothing');

  await touchAt('touchStart', await pointIn(text));
  await pause(650);
  await page.waitForFunction(() => window.copiedNotes.length === 1);
  await touchAt('touchEnd');
  assert.match(await page.evaluate(() => window.copiedNotes[0].text), /已通过双击修改/);
  await page.getByText('已复制笔记内容', { exact: true }).waitFor();
  assert.equal(await editDialog.count(), 0);
  console.log('PASS long press copies the whole note through the native clipboard bridge');

  await drag(text, -35);
  assert.equal(await card.evaluate(el => el.classList.contains('pinned')), false, 'short swipe must spring back');
  const scroller = page.locator('.mobile-shell .feed-container');
  const scrollBefore = await scroller.evaluate(el => el.scrollTop);
  const verticalDistance = scrollBefore > 0 ? 80 : -100;
  await drag(text, 3, verticalDistance);
  await pause(250);
  const scrollAfter = await scroller.evaluate(el => el.scrollTop);
  assert.ok((scrollAfter - scrollBefore) * verticalDistance < 0, 'vertical swipe must scroll the feed');
  assert.equal(await copyCount(), 1);
  assert.equal(await card.evaluate(el => el.classList.contains('pinned')), false);
  console.log('PASS short swipe cancels and vertical swipe scrolls without copying or changing the note');

  await drag(text, -105);
  await page.waitForFunction(() => document.querySelector('.mobile-note-card.pinned'));
  assert.equal(await card.getAttribute('aria-busy'), 'false');
  await drag(text, -105);
  await page.waitForFunction(() => !document.querySelector('.mobile-note-card.pinned'));
  console.log('PASS left swipe toggles pin on and off');

  const link = card.locator('.note-body a');
  await link.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 55, isPrimary: true, button: 0, clientX: 120, clientY: 200 });
  await pause(600);
  await link.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 55, isPrimary: true, button: 0, clientX: 120, clientY: 200 });
  assert.equal(await copyCount(), 1, 'long press on a link must not copy the note');
  await text.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 56, isPrimary: true, button: 0, clientX: 120, clientY: 200 });
  await text.dispatchEvent('pointercancel', { pointerType: 'touch', pointerId: 56, isPrimary: true });
  await pause(600);
  assert.equal(await copyCount(), 1, 'cancelled touch must clear the long press timer');
  await text.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 57, isPrimary: true, button: 0, clientX: 120, clientY: 200 });
  await text.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 58, isPrimary: false, button: 0, clientX: 160, clientY: 200 });
  await pause(600);
  await text.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 57, isPrimary: true, button: 0, clientX: 120, clientY: 200 });
  assert.equal(await copyCount(), 1, 'multi-touch must cancel the long press');
  await useStore('store/notes', store => store.pendingNoteIds.value.add(store.notes.value.find(note => note.content.includes('手势回归笔记')).note_id));
  await drag(text, 105);
  assert.equal(await card.count(), 1, 'busy note must ignore swipe actions');
  await useStore('store/notes', store => store.pendingNoteIds.value.clear());
  await card.getByRole('button', { name: '编辑笔记', exact: true }).tap();
  await editDialog.waitFor();
  await editDialog.getByRole('button', { name: '关闭', exact: true }).tap();
  await editDialog.waitFor({ state: 'hidden' });
  console.log('PASS links, cancelled touches, multi-touch, busy state, and existing edit button');

  await drag(text, 105);
  await card.waitFor({ state: 'detached' });
  const trash = await useStore('store/notes', async store => {
    await store.fetchTrash();
    return store.trashNotes.value;
  });
  assert.equal(trash.length, 1);
  assert.match(trash[0].content, /已通过双击修改/);
  await useStore('store/ui', store => store.setView('trash'));
  await card.waitFor();
  await drag(text, 105);
  const trashPoint = await pointIn(text);
  await tap(trashPoint);
  await pause(80);
  await tap(trashPoint);
  assert.equal(await card.count(), 1, 'swiping trash must not permanently delete');
  assert.equal(await editDialog.count(), 0, 'trash must not open an editor');
  await card.getByRole('button', { name: '恢复笔记', exact: true }).tap();
  await card.waitFor({ state: 'detached' });
  await useStore('store/ui', store => store.setView('all'));
  await card.waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS right swipe uses recoverable trash, trash gestures are disabled, and restore works; no browser errors');
} finally {
  await context.close();
  await browser.close();
}
