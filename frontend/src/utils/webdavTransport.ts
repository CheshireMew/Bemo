import { getOrCreateDeviceId } from './db';
import type { SyncTransport } from './serverTransport';

type ManifestRecord = {
  format_version: number;
  latest_cursor: string;
  latest_snapshot: string | null;
  updated_at: string;
};

function splitBlobHash(blobHash: string) {
  const [algorithm, digest] = blobHash.split(':', 2);
  if (!algorithm || !digest) {
    throw new Error(`Invalid blob hash: ${blobHash}`);
  }
  return { algorithm, digest };
}

function buildBlobPath(baseUrl: string, blobHash: string) {
  const { algorithm, digest } = splitBlobHash(blobHash);
  const prefix = digest.slice(0, 2) || '00';
  return {
    dir: `${baseUrl}/blobs/${algorithm}/${prefix}`,
    url: `${baseUrl}/blobs/${algorithm}/${prefix}/${digest}`,
  };
}

function toExactBlob(data: Uint8Array, mimeType: string) {
  return new Blob([Uint8Array.from(data)], { type: mimeType });
}

function encodeBasicAuth(username: string, password: string) {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function normalizeBase(url: string, basePath: string) {
  const root = url.replace(/\/$/, '');
  const path = basePath.replace(/^\/+|\/+$/g, '');
  return `${root}/${path ? `${path}/` : ''}bemo-sync`;
}

async function request(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init);
  if (!response.ok && response.status !== 207 && response.status !== 404 && response.status !== 405) {
    throw new Error(`WebDAV request failed: ${response.status}`);
  }
  return response;
}

async function ensureCollection(url: string, headers: HeadersInit) {
  const response = await fetch(url, { method: 'MKCOL', headers });
  if (response.ok || response.status === 405 || response.status === 301) return;
  if (response.status === 409) {
    const parent = url.slice(0, url.lastIndexOf('/'));
    if (parent && parent !== url) {
      await ensureCollection(parent, headers);
      await ensureCollection(url, headers);
      return;
    }
  }
  throw new Error(`WebDAV MKCOL failed: ${response.status}`);
}

async function readJson<T>(url: string, headers: HeadersInit): Promise<T | null> {
  const response = await request(url, { method: 'GET', headers });
  if (response.status === 404) return null;
  return response.json() as Promise<T>;
}

async function writeJson(url: string, headers: HeadersInit, payload: unknown) {
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`WebDAV PUT failed: ${response.status}`);
  }
}

function parseCursorFromPath(path: string) {
  const match = path.match(/(\d+)_/);
  return match ? Number(match[1]) : 0;
}

function normalizeHrefToPath(href: string, baseUrl: string) {
  const raw = decodeURIComponent(href || '');
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  }
  if (raw.startsWith('/')) {
    const base = new URL(baseUrl);
    return `${base.origin}${raw}`;
  }
  return `${baseUrl.replace(/\/$/, '')}/${raw.replace(/^\/+/, '')}`;
}

async function listChangeFiles(baseUrl: string, headers: HeadersInit): Promise<string[]> {
  const response = await request(`${baseUrl}/changes/`, {
    method: 'PROPFIND',
    headers: {
      ...headers,
      Depth: 'infinity',
      'Content-Type': 'application/xml',
    },
    body: `<?xml version="1.0"?><propfind xmlns="DAV:"><prop><resourcetype /></prop></propfind>`,
  });
  if (response.status === 404) return [];

  const xml = await response.text();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const responses = Array.from(doc.getElementsByTagNameNS('DAV:', 'response'));
  const files = responses.flatMap((node) => {
    const href = node.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent || '';
    const resolved = normalizeHrefToPath(href, baseUrl);
    if (!resolved.includes('/changes/')) return [];
    if (!resolved.endsWith('.json')) return [];
    return [resolved];
  });

  return Array.from(new Set(files)).sort((a, b) => parseCursorFromPath(a) - parseCursorFromPath(b));
}

async function acquireLease(baseUrl: string, headers: HeadersInit, deviceId: string) {
  const leaseUrl = `${baseUrl}/lease.json`;
  const now = Date.now();
  const current = await readJson<{ device_id: string; expires_at: string }>(leaseUrl, headers);
  if (current && Date.parse(current.expires_at) > now && current.device_id !== deviceId) {
    return false;
  }
  await writeJson(leaseUrl, headers, {
    device_id: deviceId,
    acquired_at: new Date(now).toISOString(),
    expires_at: new Date(now + 60_000).toISOString(),
  });
  return true;
}

async function releaseLease(baseUrl: string, headers: HeadersInit, deviceId: string) {
  const leaseUrl = `${baseUrl}/lease.json`;
  const current = await readJson<{ device_id: string }>(leaseUrl, headers);
  if (!current || current.device_id !== deviceId) return;
  await writeJson(leaseUrl, headers, {
    device_id: '',
    acquired_at: null,
    expires_at: new Date(0).toISOString(),
  });
}

async function readManifest(baseUrl: string, headers: HeadersInit): Promise<ManifestRecord | null> {
  return readJson<ManifestRecord>(`${baseUrl}/manifest.json`, headers);
}

async function writeManifest(baseUrl: string, headers: HeadersInit, manifest: ManifestRecord) {
  await writeJson(`${baseUrl}/manifest.json`, headers, manifest);
}

async function writeSnapshot(baseUrl: string, headers: HeadersInit, latestCursor: string) {
  const snapshotName = `snapshot_${latestCursor.padStart(8, '0')}.json`;
  await writeJson(`${baseUrl}/snapshots/${snapshotName}`, headers, {
    latest_cursor: latestCursor,
    generated_at: new Date().toISOString(),
  });
  return snapshotName;
}

export function createWebDavTransport(config: {
  webdavUrl: string;
  username: string;
  password: string;
  basePath: string;
}): SyncTransport {
  const baseUrl = normalizeBase(config.webdavUrl, config.basePath);
  const headers = {
    Authorization: encodeBasicAuth(config.username, config.password),
  };

  async function ensureLayout() {
    await ensureCollection(baseUrl, headers);
    await ensureCollection(`${baseUrl}/changes`, headers);
    await ensureCollection(`${baseUrl}/blobs`, headers);
    await ensureCollection(`${baseUrl}/snapshots`, headers);
  }

  return {
    async pull(cursor: string | null) {
      await ensureLayout();
      const manifest = await readManifest(baseUrl, headers);
      const nextCursor = Number(cursor || '0');
      const changes: any[] = [];
      let latest = Math.max(nextCursor, Number(manifest?.latest_cursor || '0'));
      const files = await listChangeFiles(baseUrl, headers);

      for (const file of files) {
        const fileCursor = parseCursorFromPath(file);
        if (fileCursor <= nextCursor) continue;
        const response = await fetch(file, { method: 'GET', headers });
        if (!response.ok) continue;
        const change = await response.json();
        change.cursor = String(fileCursor);
        changes.push(change);
        latest = Math.max(latest, fileCursor);
      }

      return { changes, latest_cursor: String(latest) };
    },
    async push(changes: any[]) {
      await ensureLayout();
      const deviceId = await getOrCreateDeviceId();
      const leaseOk = await acquireLease(baseUrl, headers, deviceId);
      if (!leaseOk) {
        throw new Error('WebDAV sync lease is held by another device');
      }

      try {
        let manifest = await readManifest(baseUrl, headers);
        let latestCursor = Number(manifest?.latest_cursor || '0');
        const accepted = [];

        for (const change of changes) {
          latestCursor += 1;
          const fileName = `${String(latestCursor).padStart(8, '0')}_${change.operation_id}.json`;
          await writeJson(`${baseUrl}/changes/${fileName}`, headers, change);
          accepted.push({
            operation_id: change.operation_id,
            cursor: String(latestCursor),
            change,
          });
        }

        const latestSnapshot = await writeSnapshot(baseUrl, headers, String(latestCursor));
        manifest = {
          format_version: 1,
          latest_cursor: String(latestCursor),
          latest_snapshot: latestSnapshot,
          updated_at: new Date().toISOString(),
        };
        await writeManifest(baseUrl, headers, manifest);
        return { accepted, conflicts: [], latest_cursor: String(latestCursor) };
      } finally {
        await releaseLease(baseUrl, headers, deviceId);
      }
    },
    async hasBlob(blobHash: string) {
      await ensureLayout();
      const { url } = buildBlobPath(baseUrl, blobHash);
      const response = await request(url, { method: 'HEAD', headers });
      return response.status >= 200 && response.status < 300;
    },
    async putBlob(blobHash: string, data: Uint8Array, mimeType = 'application/octet-stream') {
      await ensureLayout();
      const { algorithm } = splitBlobHash(blobHash);
      const { dir, url } = buildBlobPath(baseUrl, blobHash);
      await ensureCollection(`${baseUrl}/blobs/${algorithm}`, headers);
      await ensureCollection(dir, headers);
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': mimeType,
        },
        body: toExactBlob(data, mimeType),
      });
      if (!response.ok) {
        throw new Error(`WebDAV blob PUT failed: ${response.status}`);
      }
    },
    async getBlob(blobHash: string) {
      await ensureLayout();
      const { url } = buildBlobPath(baseUrl, blobHash);
      const response = await request(url, { method: 'GET', headers });
      if (response.status === 404) {
        throw new Error(`WebDAV blob not found: ${blobHash}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}
