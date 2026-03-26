import assert from 'node:assert/strict';

import { listLocalNotes } from '../src/domain/notes/localNoteQueries.js';
import { defaultSettings } from '../src/domain/settings/defaultSettings.js';
import { settings } from '../src/domain/settings/settingsState.js';
import { clearScheduledSync, resetRetryDelay } from '../src/domain/sync/syncScheduler.js';
import { flushPendingQueue } from '../src/domain/sync/syncCoordinator.js';
import { getSyncStateValue, setSyncStateValue } from '../src/domain/sync/syncStateStorage.js';
import { getSyncState } from '../src/domain/sync/syncStatusBus.js';
import { installMemoryIndexedDb } from './memoryIndexedDb.js';

installMemoryIndexedDb();

function resetSyncSettings() {
  Object.assign(settings.sync, structuredClone(defaultSettings.sync), {
    mode: 'webdav',
    webdavUrl: 'https://dav.example.com/base',
    username: 'demo',
    password: 'secret',
    basePath: '',
  });
}

async function resetDb() {
  indexedDB.deleteDatabase('bemo-offline');
}

async function withMockedBrowser<T>(
  run: (input: { delays: number[] }) => Promise<T>,
) {
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  const originalNavigator = globalThis.navigator;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const delays: number[] = [];

  const timeoutStub = ((fn: TimerHandler, delay?: number) => {
    delays.push(Number(delay || 0));
    if (typeof fn === 'function') {
      fn();
    }
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout;

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      onLine: true,
    },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      __TAURI_INTERNALS__: {},
      setTimeout: timeoutStub,
      clearTimeout: () => undefined,
    },
  });
  globalThis.setTimeout = timeoutStub;
  globalThis.clearTimeout = (() => undefined) as typeof clearTimeout;

  try {
    return await run({ delays });
  } finally {
    clearScheduledSync();
    resetRetryDelay();
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
}

async function withMockedFetch<T>(
  handler: (input: string, init?: RequestInit) => Promise<Response> | Response,
  run: () => Promise<T>,
) {
  const originalFetch = globalThis.fetch;
  const browserWindow = (globalThis as typeof globalThis & {
    window?: {
      __TAURI_INTERNALS__?: {
        invoke?: (command: string, input: { payload: { url: string; method: string; headers: Record<string, string>; body?: string } }) => Promise<{
          status: number;
          url: string;
          headers: Record<string, string>;
          body?: string;
          bodyEncoding?: 'base64';
        }>;
      };
    };
  }).window;
  const originalInvoke = browserWindow?.__TAURI_INTERNALS__?.invoke;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    try {
      return await handler(url, init);
    } catch (error) {
      if ((init?.method || 'GET') === 'GET' && url.endsWith('/pending-write.json')) {
        return new Response('', { status: 404 });
      }
      throw error;
    }
  }) as typeof fetch;
  if (browserWindow?.__TAURI_INTERNALS__) {
    browserWindow.__TAURI_INTERNALS__.invoke = async (_command, input) => {
      let response: Response;
      try {
        response = await handler(input.payload.url, {
          method: input.payload.method,
          headers: input.payload.headers,
          body: input.payload.body,
        });
      } catch (error) {
        if ((input.payload.method || 'GET') === 'GET' && input.payload.url.endsWith('/pending-write.json')) {
          response = new Response('', { status: 404 });
        } else {
          throw error;
        }
      }
      const bodyText = await response.text();
      return {
        status: response.status,
        url: input.payload.url,
        headers: Object.fromEntries(response.headers.entries()),
        body: Buffer.from(bodyText, 'utf8').toString('base64'),
        bodyEncoding: 'base64',
      };
    };
  }

  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (browserWindow?.__TAURI_INTERNALS__) {
      browserWindow.__TAURI_INTERNALS__.invoke = originalInvoke;
    }
  }
}

async function testPreflightFailureMarksOfflineAndSchedulesRetry() {
  await resetDb();
  resetSyncSettings();

  await withMockedBrowser(async ({ delays }) => {
    await withMockedFetch((url, init) => {
      if (init?.method === 'MKCOL') {
        return new Response('', { status: 405 });
      }
      if (url.endsWith('/manifest.json')) {
        throw new TypeError('Failed to fetch');
      }
      throw new Error(`unexpected request ${init?.method || 'GET'} ${url}`);
    }, async () => {
      await flushPendingQueue();
    });

    const state = getSyncState();
    assert.equal(state.status, 'offline');
    assert.match(state.error, /Failed to fetch/);
    assert.deepEqual(delays.slice(-4), [1000, 2000, 4000, 5000]);
  });
}

async function testCoordinatorResumesBootstrapFromStoredShardCursor() {
  await resetDb();
  resetSyncSettings();
  await setSyncStateValue('webdav_cursor', 'snapshot-bootstrap:snapshot_00000012.json:1');

  const files = new Map<string, string>([
    ['/base/bemo-sync/manifest.json', JSON.stringify({
      format_version: 2,
      latest_cursor: '12',
      snapshot_cursor: '12',
      latest_snapshot: 'snapshot_00000012.json',
      batches: [],
      updated_at: '2026-03-26T00:00:00.000Z',
    })],
    ['/base/bemo-sync/snapshots/snapshot_00000012.json', JSON.stringify({
      format_version: 2,
      latest_cursor: '12',
      generated_at: '2026-03-26T00:00:00.000Z',
      note_count: 2,
      shards: [
        { file: 'snapshot_00000012.json.part_0001.json', note_count: 1, estimated_bytes: 120 },
        { file: 'snapshot_00000012.json.part_0002.json', note_count: 1, estimated_bytes: 120 },
      ],
    })],
    ['/base/bemo-sync/snapshots/snapshot_00000012.json.part_0001.json', JSON.stringify({
      format_version: 2,
      latest_cursor: '12',
      generated_at: '2026-03-26T00:00:00.000Z',
      note_count: 1,
      notes: {
        'note-1': {
          note_id: 'note-1',
          scope: 'active',
          revision: 1,
          filename: 'note-1.md',
          content: 'first shard',
          tags: [],
          pinned: false,
          created_at: '2026-03-26T00:00:00.000Z',
          updated_at: '2026-03-26T00:00:00.000Z',
          attachments: [],
        },
      },
    })],
    ['/base/bemo-sync/snapshots/snapshot_00000012.json.part_0002.json', JSON.stringify({
      format_version: 2,
      latest_cursor: '12',
      generated_at: '2026-03-26T00:00:00.000Z',
      note_count: 1,
      notes: {
        'note-2': {
          note_id: 'note-2',
          scope: 'active',
          revision: 1,
          filename: 'note-2.md',
          content: 'second shard',
          tags: [],
          pinned: false,
          created_at: '2026-03-26T00:00:00.000Z',
          updated_at: '2026-03-26T00:00:00.000Z',
          attachments: [],
        },
      },
    })],
  ]);

  const shardFetches = {
    part1: 0,
    part2: 0,
  };

  await withMockedBrowser(async () => {
    await withMockedFetch((url, init) => {
      const path = new URL(url).pathname;
      if (init?.method === 'MKCOL') {
        return new Response('', { status: 405 });
      }
      if (init?.method === 'PUT') {
        files.set(path, typeof init.body === 'string' ? init.body : '');
        return new Response('', { status: 200 });
      }
      if (init?.method === 'GET' || !init?.method) {
        if (path.endsWith('part_0001.json')) shardFetches.part1 += 1;
        if (path.endsWith('part_0002.json')) shardFetches.part2 += 1;
        const body = files.get(path);
        if (!body) {
          return new Response('', { status: 404 });
        }
        return new Response(body, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }
      throw new Error(`unexpected request ${init?.method || 'GET'} ${url}`);
    }, async () => {
      await flushPendingQueue();
    });
  });

  assert.equal(shardFetches.part1, 1);
  assert.equal(shardFetches.part2 >= 1, true);
  assert.equal(await getSyncStateValue('webdav_cursor'), '12');
  const notes = await listLocalNotes();
  assert.equal(notes.length, 1);
  assert.equal(notes[0]?.note_id, 'note-2');
}

await testPreflightFailureMarksOfflineAndSchedulesRetry();
await testCoordinatorResumesBootstrapFromStoredShardCursor();

console.log('syncCoordinator.spec passed');
