// Browser regression tests. Uses an isolated browser context and mocked app data.
// Set BEMO_PLAYWRIGHT_MODULE to an existing Playwright installation if needed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BEMO_PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.env.BEMO_UX_BASE_URL || 'http://127.0.0.1:5173';
const output = process.env.BEMO_UX_OUTPUT_DIR;
if (output) await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.emulateMedia({ reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const state = { notes: [], trash: [], reads: 0, failReads: false, failWrites: false, writeDelay: 0, readDelay: 1000 };
const note = (id, content, tags = [], date = 1788134400) => ({ note_id: id, filename: `${id}.md`, title: content.split('\n')[0], content, tags, pinned: false, revision: 1, created_at: date, updated_at: date });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
await context.route('**/api/app/notes/**', async route => {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  const suffix = url.pathname.slice('/api/app/notes/'.length);
  const send = data => route.fulfill({ json: data });
  if (method !== 'GET') {
    if (state.writeDelay) await sleep(state.writeDelay);
    if (state.failWrites) return route.abort('failed');
  }
  if (method === 'GET' && suffix === '') {
    state.reads++;
    if (state.readDelay) await sleep(state.readDelay);
    if (state.failReads) return route.abort('failed');
    return send(state.notes);
  }
  if (method === 'GET' && suffix === 'search') {
    const query = url.searchParams.get('q') || '';
    if (query === '慢查询') { await sleep(900); return send([note('slow', '旧的慢查询结果')]); }
    if (query === '快查询') { await sleep(80); return send([note('fast', '新的快查询结果')]); }
    return send(state.notes.filter(item => [item.content, ...item.tags].some(value => value.includes(query))));
  }
  if (method === 'GET' && suffix === 'trash') return send(state.trash);
  if (method === 'POST' && suffix === '') {
    const payload = request.postDataJSON();
    const created = note(`created-${Date.now()}`, payload.content, payload.tags);
    state.notes.unshift(created);
    return send(created);
  }
  if (method === 'DELETE' && !suffix.startsWith('trash/')) {
    const found = state.notes.find(item => item.note_id === suffix);
    state.notes = state.notes.filter(item => item.note_id !== suffix);
    state.trash.push(found);
    return send(found);
  }
  if (method === 'POST' && suffix.endsWith('/restore')) {
    const id = suffix.split('/')[1];
    const found = state.trash.find(item => item.note_id === id);
    state.trash = state.trash.filter(item => item.note_id !== id);
    state.notes.push(found);
    return send(found);
  }
  if (method === 'DELETE' && suffix.startsWith('trash/')) {
    const id = suffix.split('/')[1];
    state.trash = state.trash.filter(item => item.note_id !== id);
    return send({ ok: true });
  }
  if (method === 'PUT') {
    const found = state.notes.find(item => item.note_id === suffix);
    Object.assign(found, request.postDataJSON());
    return send(found);
  }
  if (method === 'PATCH') {
    const found = state.notes.find(item => item.note_id === suffix);
    Object.assign(found, request.postDataJSON());
    return send(found);
  }
  return route.fallback();
});
await context.route('**/api/app/storage/attachment-summary', route => route.fulfill({
  json: {
    activeAttachments: 0,
    trashAttachments: 0,
    totalReferencedAttachments: 0,
    totalAttachmentRefs: 0,
    storedAttachments: 0,
  },
}));
await context.route('**/api/app/outbox**', route => route.fulfill({ json: [] }));
const screenshot = async name => { if (output) await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: false }); };
const waitText = text => page.getByText(text, { exact: true }).first().waitFor();
const useStore = async (module, fn) => page.evaluate(async ({ module, fn }) => {
  const modulePath = `/src/${module}.ts`;
  const loadedUrl = performance.getEntriesByType('resource').findLast(entry => new URL(entry.name).pathname === modulePath)?.name;
  const store = await import(loadedUrl || modulePath);
  await Function('store', `return (${fn})(store)`)(store);
}, { module, fn: fn.toString() });
const refresh = () => useStore('store/notes', store => store.fetchNotes());
const openSettings = async tab => {
  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  if (tab) await page.locator('.settings-nav').getByRole('button', { name: tab, exact: true }).click();
};
const closeSettings = () => page.getByRole('dialog', { name: '设置', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
const pass = name => console.log(`PASS ${name}`);

try {
  await page.goto(baseUrl);
  await page.locator('.loading-list').waitFor();
  assert.equal(await page.locator('.notes-feed').getAttribute('aria-busy'), 'true');
  await waitText('从第一条笔记开始');
  state.readDelay = 0;
  await sleep(300);
  assert.equal(state.reads, 1, 'Only one note read on a local-mode mount');
  await page.locator('body').click({ position: { x: 1400, y: 800 } });
  await page.keyboard.press('Control+k');
  assert.equal(await page.getByRole('searchbox').evaluate(el => el === document.activeElement), true);
  pass('initial empty state, one initial request, global search shortcut');

  await page.getByRole('searchbox').fill('慢查询');
  await sleep(400);
  await page.getByRole('searchbox').fill('快查询');
  await sleep(1100);
  assert.equal(await page.locator('.note-body').innerText(), '新的快查询结果');
  await page.getByRole('searchbox').fill('慢查询');
  await sleep(400);
  await page.getByRole('button', { name: '清空搜索', exact: true }).click();
  await sleep(1000);
  assert.equal(await page.locator('.note-card').count(), 0, 'Late search must not revive cleared results');
  pass('search latest result wins, clearing cancels stale results');

  state.notes = [note('experience', '共同词 体验笔记', ['体验']), note('work', '共同词 工作笔记', ['工作'])];
  await refresh();
  await page.locator('.tag-list button').filter({ hasText: '#体验' }).click();
  await page.getByRole('searchbox').fill('共同词');
  await waitText('共同词 体验笔记');
  await sleep(400);
  assert.equal(await page.locator('.note-card').count(), 1);
  await page.getByRole('searchbox').fill('不存在的笔记');
  await waitText('没有找到匹配的笔记');
  await page.getByRole('button', { name: '查看全部笔记', exact: true }).click();
  await page.locator('.note-card').nth(1).waitFor();
  pass('search combines tag filtering, empty search has reset action');

  const calendarDay = page.locator('.cal-day[tabindex="0"]');
  await calendarDay.focus();
  const dateBefore = await calendarDay.getAttribute('aria-label');
  await page.keyboard.press('ArrowRight');
  assert.notEqual(await calendarDay.getAttribute('aria-label'), dateBefore);
  assert.equal(await calendarDay.evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Enter');
  assert.equal(await calendarDay.getAttribute('aria-pressed'), 'true');
  const heatmapDay = page.locator('.heatmap-cell[tabindex="0"]');
  await heatmapDay.focus();
  const heatmapBefore = await heatmapDay.getAttribute('aria-label');
  await page.keyboard.press('ArrowUp');
  assert.notEqual(await heatmapDay.getAttribute('aria-label'), heatmapBefore);
  assert.equal(await heatmapDay.evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Enter');
  await page.locator('.nav-menu').getByRole('link', { name: '全部笔记', exact: true }).click();
  const tagButton = page.locator('.tag-list button').filter({ hasText: '#体验' });
  await tagButton.focus();
  await page.keyboard.press('Space');
  assert.equal(await tagButton.getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Space');
  assert.equal(await tagButton.getAttribute('aria-pressed'), 'false');
  await openSettings('同步');
  const radios = page.getByRole('radiogroup', { name: '同步模式' }).getByRole('radio');
  await radios.first().focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await radios.nth(1).getAttribute('aria-checked'), 'true');
  assert.equal(await radios.nth(1).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Home');
  assert.equal(await radios.first().getAttribute('aria-checked'), 'true');
  await closeSettings();
  pass('calendar, heatmap, tags and sync choices support keyboard and announce selection');

  await page.locator('.nav-menu').getByRole('link', { name: '随机漫步', exact: true }).click();
  for (let i = 0; i < 5; i++) {
    const before = await page.locator('.random-walk-view .note-body').innerText();
    await page.getByRole('button', { name: '换一篇', exact: true }).click();
    assert.notEqual(await page.locator('.random-walk-view .note-body').innerText(), before);
  }
  const originalNotes = state.notes;
  state.notes = [originalNotes[0]];
  await refresh();
  assert.equal(await page.getByRole('button', { name: '换一篇', exact: true }).isDisabled(), true);
  assert.equal(await page.locator('.stat-item').filter({ hasText: '记录天数' }).locator('.stat-num').innerText(), '1');
  state.notes = originalNotes;
  await refresh();
  await page.getByRole('button', { name: '关闭随机漫步', exact: true }).click();
  pass('random never repeats current note, single-note state is explicit, active days are real');

  const editor = page.locator('.sticky-stack .editor-card');
  await editor.getByRole('button', { name: '切换到 Markdown', exact: true }).click();
  await editor.locator('textarea.editor-input').fill('**保存的格式** 和 [链接](https://example.com)');
  state.failWrites = true;
  await editor.locator('.btn-send').click();
  await editor.locator('.editor-message-error').waitFor();
  assert.match(await editor.locator('.editor-message-error').innerText(), /保存失败.*保留/);
  assert.match(await editor.locator('textarea.editor-input').inputValue(), /保存的格式/);
  state.failWrites = false;
  state.writeDelay = 1000;
  await editor.locator('.btn-send').click();
  assert.equal(await editor.locator('textarea.editor-input').getAttribute('readonly'), '');
  const lockedContent = await editor.locator('textarea.editor-input').inputValue();
  await editor.locator('textarea.editor-input').focus();
  await page.keyboard.press('Control+b');
  await editor.locator('textarea.editor-input').evaluate(el => {
    const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', '不应插入');
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  });
  assert.equal(await editor.locator('textarea.editor-input').inputValue(), lockedContent);
  await page.locator('.note-body strong').filter({ hasText: '保存的格式' }).waitFor();
  assert.equal(await editor.locator('textarea.editor-input').inputValue(), '');
  state.writeDelay = 0;
  pass('failed save keeps content, saving locks input, Markdown saved and rendered');

  const createdCard = page.locator('.note-card').filter({ hasText: '保存的格式' });
  await createdCard.getByRole('button', { name: '将笔记移到回收站', exact: true }).click();
  await createdCard.waitFor({ state: 'hidden' });
  assert.equal(await page.getByText('笔记已移至回收站', { exact: true }).count(), 0);
  await page.locator('.nav-menu').getByRole('link', { name: '回收站', exact: true }).click();
  const trashCard = page.locator('.note-card').filter({ hasText: '保存的格式' });
  await trashCard.getByRole('button', { name: '永久删除笔记', exact: true }).click();
  await trashCard.waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('dialog', { name: '永久删除这条笔记？' }).count(), 0);
  assert.equal(await page.getByText('笔记已永久删除', { exact: true }).count(), 0);
  assert.equal(state.trash.length, 0);
  await page.locator('.nav-menu').getByRole('link', { name: '全部笔记', exact: true }).click();
  pass('delete and permanent delete run directly without success popups');

  await editor.getByRole('button', { name: '切换到富文本', exact: true }).click();
  await editor.locator('.editor-preview').fill('原选区');
  await editor.locator('.editor-preview').evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  await page.keyboard.press('Control+k');
  const linkDialog = page.getByRole('dialog', { name: '插入链接', exact: true });
  await linkDialog.getByRole('textbox').fill('https://example.com');
  await linkDialog.getByRole('button', { name: '插入', exact: true }).click();
  await editor.locator('.editor-preview a').waitFor();
  assert.equal(await editor.locator('.editor-preview a').innerText(), '原选区');
  pass('in-editor Ctrl+K opens app dialog and preserves selected text');

  await editor.getByRole('button', { name: '切换到 Markdown', exact: true }).click();
  const beforeImage = await editor.locator('textarea.editor-input').inputValue();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'draftAttachmentBlobs') {
        IDBObjectStore.prototype.put = put;
        throw new DOMException('图片暂存空间不足，请清理后重试。', 'QuotaExceededError');
      }
      return put.apply(this, args);
    };
  });
  const tinyPng = { name: 'ux-image.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ6cAAAAASUVORK5CYII=', 'base64') };
  await editor.locator('input[type=file]').setInputFiles(tinyPng);
  await editor.locator('.editor-message-error').waitFor();
  assert.match(await editor.locator('.editor-message-error').innerText(), /空间不足/);
  assert.equal(await editor.locator('textarea.editor-input').inputValue(), beforeImage);
  await editor.locator('input[type=file]').setInputFiles(tinyPng);
  await editor.locator('.image-strip').waitFor();
  await context.route('**/api/app/attachments', route => route.abort('failed'));
  await editor.locator('.btn-send').click();
  await editor.locator('.editor-message-error').waitFor();
  assert.match(await editor.locator('.editor-message-error').innerText(), /保存失败.*保留/);
  assert.match(await editor.locator('textarea.editor-input').inputValue(), /ux-image/);
  await context.unroute('**/api/app/attachments');
  await editor.locator('textarea.editor-input').fill(beforeImage);
  pass('image staging errors are visible, failed server attachment upload keeps text and attachment');

  for (const width of [900, 800, 720, 360]) {
    await page.setViewportSize({ width, height: width === 360 ? 560 : width === 900 ? 700 : 600 });
    if (width >= 800) {
      for (const selector of ['.sticky-stack', '.feed-container']) {
        const box = await page.locator(selector).boundingBox();
        assert.ok(Math.abs(box.x + box.width / 2 - width / 2) <= 2, `${selector} must stay centered at ${width}px`);
      }
    }
    await openSettings();
    for (const tab of ['同步', '外观', '附件', '导入导出', '编辑器', '快捷键', '回收站']) {
      await page.locator('.settings-nav').getByRole('button', { name: tab, exact: true }).click();
      const size = await page.locator('.settings-content').evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth }));
      assert.ok(size.width > 240, `${width}px ${tab} content width ${size.width}`);
      assert.ok(size.scrollWidth <= size.width + 2, `${width}px ${tab} overflow ${JSON.stringify(size)}`);
    }
    await screenshot(`settings-${width}`);
    await closeSettings();
  }
  pass('all settings sections at 900/800/720/360px');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const contrastResults = await page.evaluate(async () => {
    const loadedStore = name => performance.getEntriesByType('resource').findLast(entry => new URL(entry.name).pathname === `/src/store/${name}.ts`)?.name || `/src/store/${name}.ts`;
    const ui = await import(loadedStore('ui'));
    const notifications = await import(loadedStore('notifications'));
    const { nextTick } = await import('/node_modules/.vite/deps/vue.js');
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const rgb = color => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3); };
    const luminance = color => rgb(color).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const ratio = (fg, bg) => { const a = luminance(fg); const b = luminance(bg); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
    const results = [];
    for (const skin of ['default', 'nord', 'sepia']) {
      ui.setSkin(skin);
      for (const dark of [false, true]) {
        if (ui.isDarkMode.value !== dark) ui.toggleTheme();
        await nextTick();
        const css = getComputedStyle(document.documentElement);
        const value = name => css.getPropertyValue(`--${name}`).trim();
        for (const [fg, bg] of [['text-primary', 'bg-main'], ['text-primary', 'bg-card'], ['text-secondary', 'bg-main'], ['text-secondary', 'bg-card'], ['accent-color', 'bg-card'], ['accent-color', 'accent-sidebar-bg'], ['accent-foreground', 'accent-color'], ['accent-foreground', 'accent-hover']]) {
          results.push({ theme: `${skin}-${dark ? 'dark' : 'light'}`, pair: `${fg}/${bg}`, ratio: ratio(value(fg), value(bg)) });
        }
        for (const level of ['error', 'info']) {
          notifications.notifications.value = [];
          notifications.pushNotification('对比度检查', level, 10000);
          await nextTick();
          const el = document.querySelector(`.notification-${level}`);
          const style = getComputedStyle(el);
          results.push({ theme: `${skin}-${dark ? 'dark' : 'light'}`, pair: `notification-${level}`, ratio: ratio(style.color, style.backgroundColor) });
        }
      }
    }
    notifications.notifications.value = [];
    ui.setSkin('default');
    if (ui.isDarkMode.value) ui.toggleTheme();
    return results;
  });
  assert.deepEqual(contrastResults.filter(result => result.ratio < 4.5), [], 'Normal text contrast must reach 4.5:1');
  pass('all six theme/mode combinations: primary, secondary, accent, buttons and notifications pass 4.5:1 contrast');

  await page.setViewportSize({ width: 1440, height: 900 });
  state.notes = Array.from({ length: 1000 }, (_, i) => note(`bulk-${i}`, `规模测试笔记 ${i}`, [], 1788134400 + i));
  await refresh();
  assert.equal(await page.locator('.note-card').count(), 40);
  await page.getByRole('combobox', { name: '选择页码', exact: true }).selectOption('25');
  await waitText('规模测试笔记 0');
  assert.equal(await page.locator('.note-card').count(), 40);
  pass('1000 notes render at most 40 cards; last page remains reachable');
  await page.locator('.note-card').first().getByRole('button', { name: '编辑笔记', exact: true }).click();
  await page.getByRole('combobox', { name: '选择页码', exact: true }).selectOption('1');
  await page.getByRole('dialog', { name: '离开正在编辑的笔记？' }).getByRole('button', { name: '返回编辑', exact: true }).click();
  assert.equal(await page.getByRole('combobox', { name: '选择页码', exact: true }).inputValue(), '25');
  assert.equal(await page.locator('.note-card .editor-card').count(), 1);
  await page.locator('.note-card .editor-card').getByRole('button', { name: '取消', exact: true }).click();
  pass('pagination warns before abandoning an open editor and cancel preserves the page');

  await page.getByRole('button', { name: '切换深色模式', exact: true }).click();
  await useStore('store/notifications', store => store.pushNotification('深色错误通知可读性验证', 'error', 10000));
  await screenshot('dark-error');
  state.failReads = true;
  await refresh();
  await editor.locator('.editor-message').waitFor();
  assert.equal(await editor.locator('.btn-send').isDisabled(), true);
  assert.doesNotMatch(await page.locator('.notes-feed > .filter-bar-error').innerText(), /Failed to fetch/);
  state.failReads = false;
  await page.locator('.notes-feed > .filter-bar-error').getByRole('button', { name: '重试', exact: true }).click();
  await page.locator('.notes-feed > .filter-bar-error').waitFor({ state: 'hidden' });
  pass('offline cached view has clear message, composer is blocked until recovery');

  assert.deepEqual(errors, [], 'No unhandled browser exceptions');
  console.log('UX browser regressions completed');
} catch (error) {
  await screenshot('failure');
  console.error(error);
  console.error('Browser errors:', errors);
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
