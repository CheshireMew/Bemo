import assert from 'node:assert/strict';

import {
  WebDavRequestError,
  encodeBasicAuth,
  ensureCollection,
  formatWebDavError,
  getWebDavStatusMessage,
  normalizeWebDavBase,
  normalizeWebDavContainer,
  webdavRequest,
} from '../src/domain/sync/webdav/webdavRequest.js';

async function withMockedTimersAndFetch<T>(
  handler: (input: string, init?: RequestInit) => Promise<Response> | Response,
  run: (input: { delays: number[]; calls: Array<{ url: string; method: string }> }) => Promise<T>,
) {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const calls: Array<{ url: string; method: string }> = [];
  const delays: number[] = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const method = init?.method || (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET');
    calls.push({ url, method });
    return handler(url, init);
  }) as typeof fetch;
  globalThis.setTimeout = (((fn: TimerHandler, delay?: number) => {
    delays.push(Number(delay || 0));
    if (typeof fn === 'function') {
      fn();
    }
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout);

  try {
    return await run({ delays, calls });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
}

function testNormalizeWebDavContainerHandlesRootAndBasePath() {
  assert.equal(normalizeWebDavContainer('https://dav.example.com/', ''), 'https://dav.example.com');
  assert.equal(
    normalizeWebDavContainer('https://dav.example.com/', '/remote.php/dav/files/demo/'),
    'https://dav.example.com/remote.php/dav/files/demo',
  );
}

function testNormalizeWebDavBaseAppendsAppDirectory() {
  assert.equal(
    normalizeWebDavBase('https://dav.example.com/', '/remote.php/dav/files/demo/'),
    'https://dav.example.com/remote.php/dav/files/demo/bemo-sync',
  );
}

function testWebDavStatusMessagesAreReadable() {
  assert.equal(getWebDavStatusMessage(401), '认证失败，请检查用户名或密码');
  assert.equal(getWebDavStatusMessage(409), '远端父目录不存在，请检查基础路径');
}

function testFormatWebDavErrorUsesFriendlyMessage() {
  assert.equal(formatWebDavError(new WebDavRequestError(423)), '远端目录被锁定，请稍后重试');
  assert.equal(formatWebDavError(new Error('custom error')), 'custom error');
}

function testEncodeBasicAuthSupportsUtf8Credentials() {
  assert.equal(
    encodeBasicAuth('测试用户', '密码123'),
    `Basic ${Buffer.from('测试用户:密码123', 'utf8').toString('base64')}`,
  );
}

async function testWebDavRequestRetriesRateLimitBeforeSuccess() {
  let attempts = 0;
  await withMockedTimersAndFetch(
    () => {
      attempts += 1;
      if (attempts < 3) {
        return new Response('', {
          status: 429,
          headers: {
            'Retry-After': '2',
          },
        });
      }
      return new Response('{}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    },
    async ({ delays, calls }) => {
      const response = await webdavRequest('https://dav.example.com/resource.json');
      assert.equal(response.status, 200);
      assert.equal(calls.length, 3);
      assert.deepEqual(delays, [2000, 2000]);
    },
  );
}

async function testWebDavRequestSurfacesRetryAfterWhenRateLimitPersists() {
  await withMockedTimersAndFetch(
    () => new Response('', {
      status: 429,
      headers: {
        'Retry-After': '3',
      },
    }),
    async ({ delays, calls }) => {
      await assert.rejects(
        webdavRequest('https://dav.example.com/resource.json'),
        (error: unknown) => {
          assert.ok(error instanceof WebDavRequestError);
          assert.equal(error.status, 429);
          assert.equal(error.retryAfterMs, 3000);
          return true;
        },
      );
      assert.equal(calls.length, 4);
      assert.deepEqual(delays, [3000, 3000, 3000]);
    },
  );
}

async function testEnsureCollectionStopsAtDepthBoundary() {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    calls.push(url);
    return new Response('', { status: 409 });
  }) as typeof fetch;

  try {
    await assert.rejects(
      ensureCollection('https://dav.example.com/a/b/c/d/e/f/g/h/i/j/k/l/m', {}),
      /目录层级过深/,
    );
    assert.equal(calls.length, 13);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

testNormalizeWebDavContainerHandlesRootAndBasePath();
testNormalizeWebDavBaseAppendsAppDirectory();
testWebDavStatusMessagesAreReadable();
testFormatWebDavErrorUsesFriendlyMessage();
testEncodeBasicAuthSupportsUtf8Credentials();
await testWebDavRequestRetriesRateLimitBeforeSuccess();
await testWebDavRequestSurfacesRetryAfterWhenRateLimitPersists();
await testEnsureCollectionStopsAtDepthBoundary();

console.log('webdavRequest.spec passed');
