// Browser rendering, downloads, and mocked native sharing in isolated local storage.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BEMO_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const output = process.env.BEMO_IMAGE_SHARE_OUTPUT_DIR;
if (output) await mkdir(output, { recursive: true });
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const errors = [];
const useStore = (page, module, fn) => page.evaluate(async ({ module, fn }) => {
  const modulePath = `/src/${module}.ts`;
  const loadedUrl = performance.getEntriesByType('resource').findLast(entry => new URL(entry.name).pathname === modulePath)?.name;
  return Function('store', `return (${fn})(store)`)(await import(loadedUrl || modulePath));
}, { module, fn: fn.toString() });
const fixture = async native => {
  const context = await browser.newContext({ viewport: native ? { width: 390, height: 844 } : { width: 1440, height: 900 }, hasTouch: native, isMobile: native });
  await context.addInitScript(native => {
    window.__BEMO_RUNTIME_CONFIG__ = { appStorageMode: 'local' };
    window.shareCalls = [];
    window.writtenFiles = [];
    window.shareFailure = '';
    window.webShareEnabled = false;
    window.webShareThrows = false;
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => {
      if (window.webShareThrows) throw new Error('Unsupported file sharing');
      return window.webShareEnabled;
    } });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async options => {
      if (window.shareFailure) throw new DOMException('Share canceled', 'AbortError');
      const file = options.files[0];
      window.shareCalls.push({ name: file.name, type: file.type, size: file.size });
    } });
    if (!native) return;
    window.androidBridge = {};
    window.Capacitor = {
      PluginHeaders: [
        { name: 'Share', methods: ['canShare', 'share'].map(name => ({ name, rtype: 'promise' })) },
        { name: 'Filesystem', methods: ['writeFile', 'getUri'].map(name => ({ name, rtype: 'promise' })) },
      ],
      nativePromise: async (plugin, method, options) => {
        if (plugin === 'Filesystem' && method === 'writeFile') { window.writtenFiles.push(options); return { uri: `file:///cache/${options.path}` }; }
        if (plugin === 'Filesystem' && method === 'getUri') return { uri: `file:///cache/${options.path}` };
        if (plugin === 'Share' && method === 'canShare') return { value: true };
        if (plugin === 'Share' && method === 'share') {
          if (window.shareFailure) throw new Error(window.shareFailure);
          window.shareCalls.push(options);
          return {};
        }
        throw new Error(`Unexpected native call: ${plugin}.${method}`);
      },
    };
  }, native);
  await context.route('**/api/**', route => route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.BEMO_UX_BASE_URL || 'http://127.0.0.1:5173');
  await page.locator(native ? '.mobile-shell' : '.web-desktop-shell').waitFor();
  await useStore(page, 'store/notes', async store => {
    const canvas = document.createElement('canvas');
    canvas.width = 120; canvas.height = 60;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f09030'; ctx.fillRect(0, 0, 120, 60);
    window.shareFixtureImage = canvas.toDataURL('image/png');
    const paragraphs = Array.from({ length: 12 }, (_, index) => `第 ${index + 1} 段：这是一条用来分享的完整笔记，中文、English 与 **加粗文字** 都保留原来的排版。`).join('\n\n');
    await store.createNoteContent({
      content: `# 图片分享示例\n\n${paragraphs}\n\n> 引用内容\n\n- 列表内容\n- 第二项\n\n\`\`\`js\nconst text = "代码内容";\n\`\`\`\n\n这是正文的最后一段，不能截断。\n\n![图片附件](${canvas.toDataURL('image/png')})`,
      tags: ['想法', '分享'],
    });
  });
  const card = page.locator(native ? '.mobile-note-card' : '.web-desktop-note-card').filter({ hasText: '图片分享示例' });
  const dialog = page.getByRole('dialog', { name: '分享笔记图片', exact: true });
  const open = async () => {
    await card.getByRole('button', { name: '将笔记分享为图片', exact: true }).click();
    await dialog.locator('.share-image').waitFor();
    await dialog.locator('.share-image').evaluate(image => image.decode());
  };
  const close = () => dialog.getByRole('button', { name: '关闭图片分享', exact: true }).click();
  return { context, page, card, dialog, open, close };
};

try {
  const web = await fixture(false);
  await web.open();
  const imageInfo = await web.page.evaluate(async () => {
    const preview = document.querySelector('.share-image');
    const card = document.querySelector('.share-render-card');
    const image = card.querySelector('.image-attachments img');
    const cardBox = card.getBoundingClientRect();
    const imageBox = image.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = preview.naturalWidth; canvas.height = preview.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(preview, 0, 0);
    const sample = ctx.getImageData(Math.round((imageBox.x - cardBox.x + imageBox.width / 2) * 2), Math.round((imageBox.y - cardBox.y + imageBox.height / 2) * 2), 1, 1).data;
    const blob = await (await fetch(preview.src)).blob();
    const dataUrl = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
    return { width: preview.naturalWidth, height: preview.naturalHeight, cardHeight: cardBox.height, type: blob.type, dataUrl, sample: [...sample], text: card.innerText, buttons: card.querySelectorAll('button').length };
  });
  assert.equal(imageInfo.width, 1120);
  assert.ok(imageInfo.height >= Math.floor(imageInfo.cardHeight * 2));
  assert.ok(imageInfo.height > 1800, 'long note must exceed the viewport and still export fully');
  assert.equal(imageInfo.type, 'image/png');
  assert.match(imageInfo.text, /最后一段，不能截断/);
  assert.match(imageInfo.text, /#想法/);
  assert.equal(imageInfo.buttons, 0);
  assert.deepEqual(imageInfo.sample, [240, 144, 48, 255], 'attachment image must appear in the actual PNG');
  const png = Buffer.from(imageInfo.dataUrl.split(',')[1], 'base64');
  assert.deepEqual(png.subarray(0, 8), pngSignature);
  const downloadPromise = web.page.waitForEvent('download');
  await web.dialog.getByRole('button', { name: '保存图片', exact: true }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^Bemo-.*\.png$/);
  assert.deepEqual(await readFile(await download.path()), png);
  if (output) {
    await writeFile(path.join(output, 'shared-note.png'), png);
    await web.page.screenshot({ path: path.join(output, 'desktop-preview.png') });
  }
  const oldUrl = await web.dialog.locator('.share-image').getAttribute('src');
  const chooseLayout = async (id, label) => {
    const previous = await web.dialog.locator('.share-image').getAttribute('src');
    await web.dialog.getByRole('button', { name: label, exact: true }).click();
    await web.page.waitForFunction(({ id, previous }) => {
      const image = document.querySelector('.share-image');
      return document.querySelector('.share-render-card')?.dataset.layout === id && image?.naturalWidth === 1120
        && image.src !== previous && document.querySelector('.share-preview')?.getAttribute('aria-busy') === 'false';
    }, { id, previous });
    return web.dialog.locator('.share-image').evaluate(async image => {
      const bytes = new Uint8Array(await (await fetch(image.src)).arrayBuffer());
      return [...bytes];
    });
  };
  const variants = [['paper', '书页'], ['night', '夜读'], ['column', '专栏'], ['minimal', '留白']];
  const longImages = new Map();
  for (const [id, label] of variants) {
    const bytes = Buffer.from(await chooseLayout(id, label));
    assert.deepEqual(bytes.subarray(0, 8), pngSignature);
    longImages.set(id, bytes);
    assert.equal(await web.page.locator('.share-render-card').getByText('这是正文的最后一段，不能截断。', { exact: true }).count(), 1);
  }
  assert.equal(new Set([...longImages.values()].map(bytes => bytes.toString('base64'))).size, 4, 'all four layouts must produce distinct images');
  await useStore(web.page, 'store/ui', store => { store.setSkin('sepia'); store.toggleTheme(); });
  for (const [id, label] of variants) {
    assert.deepEqual(Buffer.from(await chooseLayout(id, label)), longImages.get(id), 'export layout must be independent of app theme and dark mode');
  }
  await useStore(web.page, 'store/ui', store => { store.setSkin('default'); store.toggleTheme(); });
  await web.close();
  assert.equal(await web.page.locator('.share-render-stage').count(), 0);
  assert.equal(await web.page.evaluate(url => fetch(url).then(() => false, () => true), oldUrl), true, 'preview object URL must be released');
  console.log('PASS full PNG, Markdown, attachments, download, four layouts, theme independence, and cleanup');

  if (output) {
    await useStore(web.page, 'store/notes', store => store.createNoteContent({
      content: '想起来了，我还是要等 AI 泡沫，泡沫破裂绝不是只是 AI 行业元气大伤那么简单，还会带动各行各业的资产下跌。覆巢之下，焉有完卵？', tags: [],
    }));
    const sampleCard = web.page.locator('.web-desktop-note-card').filter({ hasText: '想起来了，我还是要等 AI 泡沫' });
    await sampleCard.getByRole('button', { name: '将笔记分享为图片', exact: true }).click();
    await web.dialog.locator('.share-image').waitFor();
    const samples = [];
    for (const [id, label] of variants) {
      const bytes = Buffer.from(await chooseLayout(id, label));
      await writeFile(path.join(output, `layout-${id}.png`), bytes);
      samples.push({ id, label, data: bytes.toString('base64') });
    }
    await web.page.screenshot({ path: path.join(output, 'layout-picker-desktop.png') });
    const board = await web.context.newPage();
    await board.setViewportSize({ width: 1200, height: 1100 });
    const ordered = ['minimal', 'paper', 'night', 'column'].map(id => samples.find(sample => sample.id === id));
    await board.setContent(`<html><head><style>body{margin:0;padding:32px;background:#dfe5ec;font-family:'Segoe UI','Microsoft YaHei',sans-serif}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}figure{margin:0}figcaption{font-size:17px;color:#253447;margin-bottom:12px;font-weight:600}img{display:block;width:100%;height:auto}</style></head><body><main>${ordered.map(sample => `<figure><figcaption>${sample.label}</figcaption><img src="data:image/png;base64,${sample.data}"></figure>`).join('')}</main></body></html>`);
    await board.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await board.screenshot({ path: path.join(output, 'layouts-comparison.png'), fullPage: true });
    await board.close();
    await web.close();
  }

  await web.page.evaluate(() => { window.webShareEnabled = true; });
  await web.open();
  await web.dialog.getByRole('button', { name: '分享图片', exact: true }).click();
  const webCalls = await web.page.evaluate(() => window.shareCalls);
  assert.equal(webCalls.length, 1);
  assert.equal(webCalls[0].type, 'image/png');
  await web.page.evaluate(() => { window.shareFailure = 'cancel'; });
  await web.dialog.getByRole('button', { name: '分享图片', exact: true }).click();
  assert.equal(await web.dialog.locator('.action-error').count(), 0, 'share cancellation must not show an error');
  await web.close();
  await web.page.evaluate(() => { window.webShareThrows = true; });
  await web.open();
  await web.dialog.getByRole('button', { name: '保存图片', exact: true }).waitFor();
  assert.equal(await web.dialog.getByRole('button', { name: '分享图片', exact: true }).count(), 0);
  await web.close();

  let imageAvailable = false;
  const fixturePng = Buffer.from((await web.page.evaluate(() => window.shareFixtureImage)).split(',')[1], 'base64');
  await web.page.route('**/share-missing.png', route => imageAvailable
    ? route.fulfill({ body: fixturePng, contentType: 'image/png' })
    : route.fulfill({ status: 404 }));
  await useStore(web.page, 'store/notes', store => store.createNoteContent({ content: `图片加载失败示例\n\n![图片](${location.origin}/share-missing.png)`, tags: [] }));
  const brokenCard = web.page.locator('.web-desktop-note-card').filter({ hasText: '图片加载失败示例' });
  await brokenCard.getByRole('button', { name: '将笔记分享为图片', exact: true }).click();
  await web.dialog.getByText('笔记中的图片加载失败，请重试。', { exact: true }).waitFor();
  assert.equal(await web.dialog.locator('.share-image').count(), 0, 'failed image must not be silently omitted');
  imageAvailable = true;
  await web.dialog.getByRole('button', { name: '重新生成', exact: true }).click();
  await web.dialog.locator('.share-image').waitFor();
  await web.close();
  await web.context.close();
  console.log('PASS browser file sharing, cancellation, download fallback, and image failure retry');

  const mobile = await fixture(true);
  for (const width of [320, 360, 390]) {
    await mobile.page.setViewportSize({ width, height: 844 });
    const actions = mobile.card.locator('.note-actions');
    assert.equal(await actions.locator('button').count(), 5);
    assert.ok(await actions.evaluate(el => el.getBoundingClientRect().right <= innerWidth), 'mobile share button must fit the viewport');
  }
  await mobile.open();
  for (const width of [320, 390]) {
    await mobile.page.setViewportSize({ width, height: 844 });
    const buttons = mobile.dialog.locator('.layout-option');
    assert.equal(await buttons.count(), 4);
    assert.ok(await buttons.last().evaluate(el => el.getBoundingClientRect().right <= innerWidth), 'all layout choices must fit mobile width');
  }
  if (output) await mobile.page.screenshot({ path: path.join(output, 'mobile-preview.png') });
  await mobile.dialog.getByRole('button', { name: '分享图片', exact: true }).click();
  await mobile.page.waitForFunction(() => window.shareCalls.length === 1 || document.querySelector('.action-error'));
  assert.equal(await mobile.dialog.locator('.action-error').count(), 0);
  const native = await mobile.page.evaluate(() => ({ written: window.writtenFiles, shared: window.shareCalls }));
  assert.equal(native.written.length, 1);
  assert.equal(native.written[0].directory, 'CACHE');
  assert.deepEqual(Buffer.from(native.written[0].data, 'base64').subarray(0, 8), pngSignature);
  assert.deepEqual(native.shared[0].files, [`file:///cache/${native.written[0].path}`]);
  assert.equal(native.shared[0].dialogTitle, '分享笔记图片');
  await mobile.page.evaluate(() => { window.shareFailure = 'Share canceled'; });
  await mobile.dialog.getByRole('button', { name: '分享图片', exact: true }).click();
  await mobile.dialog.getByRole('button', { name: '分享图片', exact: true }).waitFor();
  assert.equal(await mobile.dialog.locator('.action-error').count(), 0);
  await mobile.page.evaluate(() => { window.shareFailure = 'Native share failed'; });
  await mobile.dialog.getByRole('button', { name: '分享图片', exact: true }).click();
  await mobile.dialog.getByText('分享失败，请重试。', { exact: true }).waitFor();
  await mobile.page.evaluate(() => window.dispatchEvent(new Event('bemoBackButton')));
  await mobile.dialog.waitFor({ state: 'detached' });
  await mobile.context.close();
  assert.deepEqual(errors, []);
  console.log('PASS mobile button layout, native PNG sharing, cancellation, error feedback, and back dismissal');
} finally {
  await browser.close();
}
