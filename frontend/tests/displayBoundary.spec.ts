import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installMemoryIndexedDb } from './memoryIndexedDb.js';
import { setRuntimeConfigOverride } from '../src/config.js';
import { putCachedNote } from '../src/domain/notes/notesStorage.js';
import { listDisplayNotes } from '../src/domain/appStore/notesAdapter.js';
import { appRequest } from '../src/domain/appStore/backendAppApi.js';

installMemoryIndexedDb();
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://bemo.test' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document });
const { renderMarkdownToHtml } = await import('../src/utils/markdownRenderer.js');
let failures = 0;
try {
  const html = await renderMarkdownToHtml('<img src="x" onerror="alert(1)"><svg onload="alert(1)"></svg>\n\n[bad](javascript:alert%281%29)\n\n**keep**');
  const output = new JSDOM(html).window.document;
  assert.equal(output.querySelector('[onerror], [onload], svg, a[href^="javascript:"]'), null);
  assert.equal(output.querySelector('strong')?.textContent, 'keep');
  console.log('PASS 010 shared markdown filters executable HTML');
} catch (error) { failures++; console.error('FAIL 010 shared markdown filters executable HTML', error); }
const originalFetch = globalThis.fetch;
try {
  setRuntimeConfigOverride({ apiBase: 'http://127.0.0.1:19999', appStorageMode: 'backend' });
  let credentials: RequestCredentials | undefined;
  globalThis.fetch = async (_url, init) => { credentials = init?.credentials; return Response.json({ ok: true }); };
  await appRequest('/api/app/replica/read', { method: 'POST', body: '{}' });
  assert.equal(credentials, 'same-origin', '006 loopback CORS uses no cross-origin credentials; same-origin Docker auth is retained');
  console.log('PASS 006 app API credentials match desktop and same-origin deployment');
} catch (error) { failures++; console.error('FAIL 006 app API credential mode', error); }
try {
  setRuntimeConfigOverride({ apiBase: 'http://127.0.0.1:19999', appStorageMode: 'backend' });
  await putCachedNote({ note_id: 'cached', filename: 'cached.md', title: 'cached', content: 'retained', tags: [], pinned: false, revision: 1, created_at: 1, updated_at: 1 });
  globalThis.fetch = async () => new Response('unavailable', { status: 503 });
  const result = await listDisplayNotes() as unknown as { notes: unknown[]; source: string; error: string };
  assert.equal(result.source, 'cache');
  assert.ok(result.error);
  assert.equal(result.notes.length, 1);
  globalThis.fetch = async () => Response.json([{ note_id: 'primary', filename: 'primary.md', title: 'current', content: 'fresh', tags: [], pinned: false, revision: 1, created_at: 1, updated_at: 1 }]);
  const retried = await listDisplayNotes();
  assert.equal(retried.source, 'primary');
  assert.equal(retried.error, '');
  assert.equal(retried.notes[0]?.content, 'fresh');
  console.log('PASS 009 stale data has explicit error state and retry clears it');
} catch (error) { failures++; console.error('FAIL 009 stale data has explicit error state', error); }
finally { globalThis.fetch = originalFetch; dom.window.close(); }
assert.equal(failures, 0);
