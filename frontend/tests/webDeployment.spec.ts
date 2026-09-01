import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const origin = 'https://bemo.test';
const entries = new Map<string, Response>([[`${origin}/`, new Response('old-shell')]]);
const handlers: Record<string, (event: any) => void> = {};
let offline = false;
const key = (request: string | Request) => new URL(typeof request === 'string' ? request : request.url, origin).href;
const cache = {
  match: async (request: string | Request) => entries.get(key(request))?.clone(),
  put: async (request: string | Request, response: Response) => { entries.set(key(request), response); },
};
vm.runInNewContext(readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8'), {
  self: { location: { origin }, addEventListener: (name: string, cb: any) => { handlers[name] = cb; }, skipWaiting() {}, clients: { claim() {} } },
  caches: { open: async () => cache, match: cache.match, keys: async () => [] }, URL,
  fetch: async () => { if (offline) throw new Error('offline'); return new Response('new-shell'); },
});
async function navigate() {
  let response: Promise<Response> | undefined;
  const pending: Promise<unknown>[] = [];
  handlers.fetch!({ request: { url: `${origin}/`, method: 'GET', mode: 'navigate', headers: new Headers() },
    respondWith: (value: Promise<Response>) => { response = value; }, waitUntil: (value: Promise<unknown>) => pending.push(value) });
  const result = await response;
  await Promise.all(pending);
  return result?.text();
}
assert.equal(await navigate(), 'new-shell', '008 a cached client must receive the deployed shell');
offline = true;
assert.equal(await navigate(), 'new-shell', '008 offline navigation uses the last successful shell');
for (const path of ['/api/app/notes', '/images/private.png']) {
  let intercepted = false;
  handlers.fetch!({ request: { url: origin + path, method: 'GET' }, respondWith() { intercepted = true; } });
  assert.equal(intercepted, false, '008 private data must not enter static caching');
}
console.log('PASS 008 online upgrade, offline shell and private-data bypass');

// Source contracts only: these do not replace the opt-in Docker runtime check.
const nginx = readFileSync(new URL('../../nginx.conf', import.meta.url), 'utf8');
const compose = readFileSync(new URL('../../../docker-compose.yml', import.meta.url), 'utf8');
assert.match(nginx, /auth_basic_user_file\s+\/etc\/nginx\/bemo\.htpasswd;/);
assert.match(nginx, /location \/api\/\s*\{[^}]*proxy_pass http:\/\/backend:8000;/s);
assert.match(nginx, /location \/images\/\s*\{[^}]*proxy_pass http:\/\/backend:8000;/s);
assert.match(nginx, /location \/api\/sync\/\s*\{[^}]*auth_basic off;/s);
const backendService = compose.split('  backend:')[1]?.split('  frontend:')[0];
assert.ok(backendService);
assert.doesNotMatch(backendService, /^\s+ports:/m, '011 raw app storage must not be published');
assert.match(compose, /BEMO_AUTH_FILE:\?/);
assert.match(compose, /create_host_path: false/);
assert.match(compose, /bemo_data:\/app\/data/);
console.log('PASS 007/011 deployment source contracts (not Docker runtime verification)');
