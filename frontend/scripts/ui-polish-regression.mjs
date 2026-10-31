// Windows browser checks against isolated notes and IndexedDB; no user data is touched.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BEMO_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const output = process.env.BEMO_UX_OUTPUT_DIR;
if (output) await mkdir(output, { recursive: true });
const errors = [];
const results = [];
page.on('pageerror', error => errors.push(error.message));
const pass = message => { results.push(message); console.log(`PASS ${message}`); };
const screenshot = async name => { if (output) await page.screenshot({ path: path.join(output, `${name}.png`) }); };
const useModule = (modulePath, fn, data) => page.evaluate(async ({ modulePath, fn, data }) => {
  const loaded = performance.getEntriesByType('resource').findLast(entry => new URL(entry.name).pathname === modulePath)?.name;
  const module = await import(loaded || modulePath);
  return Function('module', 'data', `return (${fn})(module, data)`)(module, data);
}, { modulePath, fn: fn.toString(), data });
const openSettings = async label => {
  await page.getByRole('button', { name: '打开设置', exact: true }).click();
  await page.locator('.settings-nav').getByRole('button', { name: label, exact: true }).click();
};
const closeSettings = () => page.getByRole('dialog', { name: '设置', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
const content = '第一行\n第二行\n\n~~删除线~~\n\n![测试原图](/images/first.png)\n\n![第二张](/images/second.png)';
const notes = [{ note_id: 'polish-note', filename: 'polish-note.md', content, title: '第一行', tags: ['回顾'], pinned: false, revision: 1, edit_version: 'polish-note', created_at: 1793404800, updated_at: 1793404800 }];
await context.route('**/api/**', route => {
  const pathname = new URL(route.request().url()).pathname;
  if (pathname.endsWith('/notes/')) return route.fulfill({ json: notes });
  if (pathname.endsWith('/storage/attachment-summary')) return route.fulfill({ json: { activeAttachments: 0, trashAttachments: 0, storedAttachments: 0, totalReferencedAttachments: 0, totalAttachmentRefs: 0 } });
  return route.fulfill({ json: [] });
});
let imageReady = false;
let imageDelay = 0;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ6cAAAAASUVORK5CYII=', 'base64');
await context.route('**/images/*.png', async route => {
  if (route.request().url().endsWith('/first.png') && !imageReady) return route.abort('failed');
  if (imageDelay) await new Promise(resolve => setTimeout(resolve, imageDelay));
  if (route.request().url().endsWith('/second.png')) return route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800"><rect width="1200" height="1800" fill="#d8e7df"/><path d="M100 100H1100V1700H100Z" fill="none" stroke="#147a46" stroke-width="8"/><text x="600" y="900" text-anchor="middle" fill="#147a46" font-size="80">Bemo preview</text></svg>',
  });
  return route.fulfill({ contentType: 'image/png', body: png });
});

try {
  await page.goto(process.env.BEMO_UX_BASE_URL || 'http://127.0.0.1:5173');
  await page.locator('.note-body del').waitFor();
  assert.equal(await page.locator('.note-body br').count(), 1);
  await openSettings('编辑器');
  await page.getByRole('checkbox', { name: /^换行转/ }).setChecked(false);
  await page.getByRole('checkbox', { name: /^启用 GFM/ }).setChecked(false);
  await closeSettings();
  await page.waitForFunction(() => !document.querySelector('.note-body del, .note-body br'));
  await openSettings('编辑器');
  await page.getByRole('checkbox', { name: /^换行转/ }).setChecked(true);
  await page.getByRole('checkbox', { name: /^启用 GFM/ }).setChecked(true);
  await closeSettings();
  await page.locator('.note-body del').waitFor();
  assert.equal(await page.locator('.note-body br').count(), 1);
  pass('Markdown display changes update existing cards immediately, in both directions');

  const editor = page.locator('.sticky-stack .editor-card');
  const longText = Array.from({ length: 80 }, (_, i) => `第 ${i + 1} 行，长笔记记录。`).join('\n');
  for (const width of [1440, 900, 640, 360]) {
    await page.setViewportSize({ width, height: 600 });
    await page.evaluate(() => window.scrollTo(0, 0));
    if (await editor.locator('textarea').isHidden()) await editor.getByRole('button', { name: '切换到 Markdown', exact: true }).click();
    await editor.locator('textarea').fill(longText);
    await page.evaluate(() => window.scrollTo(0, 0));
    const toolbar = await editor.locator('.editor-toolbar').boundingBox();
    assert.ok(toolbar.y >= 0 && toolbar.y + toolbar.height <= 600, `Long composer toolbar must fit at ${width}px`);
    assert.ok(await editor.locator('textarea').evaluate(el => el.scrollHeight > el.clientHeight), 'Long Markdown remains scrollable');
    await editor.getByRole('button', { name: '切换到富文本', exact: true }).click();
    await editor.locator('.editor-preview').fill(longText);
    const richToolbar = await editor.locator('.editor-toolbar').boundingBox();
    assert.ok(richToolbar.y + richToolbar.height <= 600, `Long rich-text toolbar must fit at ${width}px`);
    await screenshot(`long-editor-${width}`);
    await editor.locator('.editor-preview').fill('');
  }
  await editor.getByRole('button', { name: '添加标签', exact: true }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await editor.getByRole('textbox', { name: '笔记标签', exact: true }).evaluate(el => el === document.activeElement), true);
  await editor.getByRole('button', { name: '添加标签', exact: true }).click();
  await page.waitForFunction(() => document.activeElement === document.querySelector('.sticky-stack .editor-preview'));
  pass('Long drafts keep their toolbar visible at 1440/900/640/360px; tag editing receives and restores keyboard focus');

  await page.setViewportSize({ width: 1280, height: 800 });
  const imageTrigger = page.locator('.note-image-card').first();
  await imageTrigger.click();
  const preview = page.getByRole('dialog', { name: '图片预览', exact: true });
  await preview.getByText('图片未能加载', { exact: true }).waitFor();
  await screenshot('preview-failed');
  imageReady = true;
  imageDelay = 250;
  await preview.getByRole('button', { name: '重新加载', exact: true }).click();
  assert.equal(await preview.locator('.preview-stage').getAttribute('aria-busy'), 'true');
  await preview.locator('.preview-image').waitFor({ state: 'visible' });
  assert.ok(await preview.locator('.preview-image').evaluate(el => el.naturalWidth > 0));
  assert.equal(await preview.evaluate(el => el.contains(document.activeElement)), true);
  await page.keyboard.press('ArrowRight');
  await preview.getByText('2 / 2', { exact: true }).waitFor();
  await preview.locator('.preview-image').waitFor({ state: 'visible' });
  for (const width of [1280, 360]) {
    const height = width === 360 ? 640 : 800;
    await page.setViewportSize({ width, height });
    const box = await preview.locator('.preview-image').boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, 'Portrait image fits the window');
    const navContrast = await preview.locator('.nav-btn').first().evaluate(el => {
      const style = getComputedStyle(el);
      const foreground = style.color.match(/[\d.]+/g).map(Number);
      const background = style.backgroundColor.match(/[\d.]+/g).map(Number);
      const luminance = rgb => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const a = luminance(foreground); const b = luminance(background);
      return { ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), opaque: background.length === 3 || background[3] === 1 };
    });
    assert.ok(navContrast.opaque && navContrast.ratio >= 3, 'Image navigation stays readable over bright pictures');
    await screenshot(`preview-loaded-${width}`);
  }
  await page.keyboard.press('ArrowLeft');
  await preview.getByText('1 / 2', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await preview.waitFor({ state: 'hidden' });
  assert.equal(await imageTrigger.evaluate(el => el === document.activeElement), true);
  await page.setViewportSize({ width: 1280, height: 800 });
  pass('Image failure retries in place, loading is announced, arrows switch images, Escape restores the opener');

  await useModule('/src/domain/sync/conflictStorage.ts', async module => {
    await module.addConflict('server', {
      note_id: 'note_'.repeat(32), operation_id: 'operation_'.repeat(24), reason: 'revision_conflict',
      local_filename: '原始笔记.md', conflict_copy_filename: '原始笔记的冲突副本.md',
      local_snapshot: { content: '本地保留的想法\n需要比较这一段内容。', tags: ['本地'], pinned: true, revision: 3 },
      remote_snapshot: { content: '远端的新内容\n另一台设备继续补充的记录。', tags: ['远端'], pinned: false, revision: 4 },
    });
    await module.addConflict('webdav', {
      note_id: 'deleted-note', operation_id: 'delete-operation', reason: 'revision_conflict',
      local_snapshot: { content: '删除前仍保留的本地正文', tags: [], revision: 2 },
      remote_snapshot: { purged: true, revision: 3 },
    });
  });
  // Inject a real IndexedDB read failure once, then let the same UI retry succeed.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args) {
      if (this.name === 'conflicts') {
        IDBObjectStore.prototype.getAll = original;
        throw new DOMException('测试读取失败', 'UnknownError');
      }
      return original.apply(this, args);
    };
  });
  await openSettings('冲突处理');
  await page.getByText('冲突记录读取失败，请重试。', { exact: true }).waitFor();
  await page.locator('.conflict-error').getByRole('button', { name: '重试', exact: true }).click();
  await page.locator('.conflict-card').nth(1).waitFor();
  assert.equal(await page.getByRole('heading', { name: '冲突记录', exact: true }).evaluate(el => el === document.activeElement), true);
  await page.getByText('已永久删除', { exact: true }).waitFor();
  const conflict = page.locator('.conflict-card').filter({ hasText: '原始笔记的冲突副本.md' });
  assert.equal(await conflict.getByRole('heading', { name: '本地版本', exact: true }).count(), 1);
  assert.equal(await conflict.getByRole('heading', { name: '远端版本', exact: true }).count(), 1);
  await conflict.getByRole('button', { name: '保留本地并重试', exact: true }).click();
  await conflict.locator('.conflict-error').waitFor();
  assert.match(await conflict.locator('.conflict-error').innerText(), /同步目标/);
  assert.equal(await conflict.getByRole('button', { name: '保留本地并重试', exact: true }).isEnabled(), true);
  await page.waitForFunction(() => document.activeElement?.textContent.trim() === '保留本地并重试');
  assert.equal(await conflict.getByRole('button', { name: '保留本地并重试', exact: true }).evaluate(el => el === document.activeElement), true, 'Failed action returns focus to its retry button');
  pass('Conflict read failure retries without losing focus; versions and remote deletion are readable; failed action keeps the record and retry focus');

  const contrast = [];
  for (const skin of ['default', 'nord', 'sepia']) {
    for (const dark of [false, true]) {
      await useModule('/src/store/ui.ts', (ui, data) => {
        ui.setSkin(data.skin);
        if (ui.isDarkMode.value !== data.dark) ui.toggleTheme();
      }, { skin, dark });
      await page.waitForTimeout(30);
      const values = await conflict.evaluate(el => {
        const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
        const ctx = canvas.getContext('2d');
        const luminance = color => {
          ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        };
        const ratio = (a, b) => { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
        const background = getComputedStyle(el).backgroundColor;
        return ['.conflict-reason', '.conflict-tip', '.snapshot-content', '.snapshot-tags', '.conflict-error'].map(selector => ({ selector, ratio: ratio(getComputedStyle(el.querySelector(selector)).color, background) }));
      });
      contrast.push(...values.map(value => ({ skin, dark, ...value })));
      for (const width of [1440, 800, 640, 360]) {
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 640 });
        const size = await page.locator('.settings-content').evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth }));
        assert.ok(size.scrollWidth <= size.width + 1, `Conflict page overflow at ${skin}/${dark}/${width}: ${JSON.stringify(size)}`);
      }
    }
  }
  assert.deepEqual(contrast.filter(value => value.ratio < 4.5), []);
  await page.setViewportSize({ width: 1440, height: 900 });
  await conflict.locator('summary').click();
  await screenshot('conflicts-dark-wide');
  await page.setViewportSize({ width: 360, height: 640 });
  await screenshot('conflicts-dark-narrow');
  pass('Conflict content and errors pass 4.5:1 in all six themes; long identifiers fit at 1440/800/640/360px');

  // A failed write must stay actionable; repeated clicks cannot apply the same action twice.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (...args) {
      if (this.name === 'conflicts') {
        IDBObjectStore.prototype.delete = original;
        throw new DOMException('测试写入失败，请重试。', 'UnknownError');
      }
      return original.apply(this, args);
    };
  });
  await conflict.getByRole('button', { name: '接受当前结果', exact: true }).click();
  await conflict.getByText('测试写入失败，请重试。', { exact: true }).waitFor();
  await conflict.getByRole('button', { name: '接受当前结果', exact: true }).evaluate(el => { el.click(); el.click(); });
  await conflict.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.conflict-card').count(), 1);
  assert.equal(await page.locator('.conflict-card').getByRole('button', { name: '保留本地并重试', exact: true }).evaluate(el => el === document.activeElement), true);
  await page.locator('.conflict-card').getByRole('button', { name: '忽略', exact: true }).click();
  await page.getByText('当前没有未处理的同步冲突。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: '冲突记录', exact: true }).evaluate(el => el === document.activeElement), true);
  pass('Conflict write failure preserves retry; rapid repeated acceptance is guarded; completion returns focus to the next record or heading');
  assert.deepEqual(errors, [], 'No unhandled browser exceptions');
  if (output) await writeFile(path.join(output, 'results.json'), JSON.stringify({ results, errors, contrast }, null, 2));
} catch (error) {
  await screenshot('failure');
  console.error(error);
  console.error('Browser errors:', errors);
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
