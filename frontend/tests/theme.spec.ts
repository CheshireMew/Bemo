import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { currentSkin, initTheme, isDarkMode, setSkin, toggleTheme, type ThemeSkin } from '../src/store/ui.js';

const dom = new JSDOM('<!doctype html><html></html>', { url: 'https://bemo.test' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage });
let systemDark = false;
Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: systemDark }) });
const root = document.documentElement;

initTheme();
assert.equal(currentSkin.value, 'cream');
assert.ok(root.classList.contains('theme-cream'));
assert.equal(isDarkMode.value, false);

for (const skin of ['default', 'nord', 'sepia', 'cream'] as ThemeSkin[]) {
  setSkin(skin);
  assert.equal(localStorage.getItem('theme-skin'), skin);
  initTheme();
  assert.equal(currentSkin.value, skin);
  assert.deepEqual([...root.classList].filter(c => c.startsWith('theme-')), skin === 'default' ? [] : [`theme-${skin}`]);
  toggleTheme();
  assert.ok(root.classList.contains('dark'));
  initTheme();
  assert.equal(isDarkMode.value, true);
  toggleTheme();
  assert.equal(root.classList.contains('dark'), false);
}

localStorage.clear();
systemDark = true;
initTheme();
assert.equal(currentSkin.value, 'cream');
assert.ok(root.classList.contains('dark'));
localStorage.setItem('theme-mode', 'light');
initTheme();
assert.equal(isDarkMode.value, false);
localStorage.setItem('theme-skin', 'invalid');
initTheme();
assert.equal(currentSkin.value, 'cream');
dom.window.close();
console.log('PASS cream default, saved themes, class cleanup and light/dark persistence');
