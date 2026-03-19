import { ensureCollection, readJson, webdavRequest, writeJson } from './webdavRequest.js';

export const CHANGE_BUCKET_SIZE = 1000;

type OperationMarker = {
  operation_id: string;
  cursor: string;
  path: string;
  timestamp: string;
};

function parseCursorFromPath(path: string) {
  const match = path.match(/(\d+)_/);
  return match ? Number(match[1]) : 0;
}

export function getChangeBucketName(cursor: number) {
  return String(Math.max(0, Math.floor((Math.max(1, cursor) - 1) / CHANGE_BUCKET_SIZE))).padStart(4, '0');
}

function getOperationMarkerUrl(baseUrl: string, operationId: string) {
  return `${baseUrl}/operations/${encodeURIComponent(operationId)}.json`;
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

async function listWebDavDirectoryEntries(url: string, headers: HeadersInit, depth = '1'): Promise<string[]> {
  const response = await webdavRequest(url, {
    method: 'PROPFIND',
    headers: {
      ...headers,
      Depth: depth,
      'Content-Type': 'application/xml',
    },
    body: `<?xml version="1.0"?><propfind xmlns="DAV:"><prop><resourcetype /></prop></propfind>`,
  });
  if (response.status === 404 || response.status === 405) return [];

  const xml = await response.text();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const responses = Array.from(doc.getElementsByTagNameNS('DAV:', 'response'));
  return responses.flatMap((node) => {
    const href = node.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent || '';
    const resolved = normalizeHrefToPath(href, url.endsWith('/') ? url.slice(0, -1) : url);
    return resolved ? [resolved] : [];
  });
}

function collectChangeFiles(entries: string[], minCursor: number) {
  return entries.filter((resolved) => {
    if (!resolved.includes('/changes/')) return false;
    if (!resolved.endsWith('.json')) return false;
    return parseCursorFromPath(resolved) > minCursor;
  });
}

export async function listWebDavChangeFiles(
  baseUrl: string,
  headers: HeadersInit,
  cursor: string | null,
  latestManifestCursor: string | null,
): Promise<string[]> {
  const nextCursor = Number(cursor || '0');
  const latestCursor = Number(latestManifestCursor || '0');
  const changeRootUrl = `${baseUrl}/changes/`;
  const files = new Set<string>();

  const rootEntries = await listWebDavDirectoryEntries(changeRootUrl, headers, '1');
  for (const file of collectChangeFiles(rootEntries, nextCursor)) {
    files.add(file);
  }

  const bucketNames = new Set<string>();
  if (latestCursor > nextCursor) {
    for (let cursorValue = nextCursor + 1; cursorValue <= latestCursor; cursorValue += CHANGE_BUCKET_SIZE) {
      bucketNames.add(getChangeBucketName(cursorValue));
    }
  } else {
    for (const entry of rootEntries) {
      const match = entry.match(/\/changes\/([^/]+)\/?$/);
      if (match && /^\d{4,}$/.test(match[1])) {
        bucketNames.add(match[1]);
      }
    }
  }

  for (const bucketName of bucketNames) {
    const bucketEntries = await listWebDavDirectoryEntries(`${changeRootUrl}${bucketName}/`, headers, '1');
    for (const file of collectChangeFiles(bucketEntries, nextCursor)) {
      files.add(file);
    }
  }

  return Array.from(files).sort((a, b) => parseCursorFromPath(a) - parseCursorFromPath(b));
}

export async function pullWebDavChanges(baseUrl: string, headers: HeadersInit, cursor: string | null, latestManifestCursor: string | null) {
  const nextCursor = Number(cursor || '0');
  const changes: any[] = [];
  let latest = Math.max(nextCursor, Number(latestManifestCursor || '0'));
  const files = await listWebDavChangeFiles(baseUrl, headers, cursor, latestManifestCursor);

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

  return { changes, latestCursor: String(latest) };
}

export async function pushWebDavChanges(baseUrl: string, headers: HeadersInit, startingCursor: number, changes: any[]) {
  let latestCursor = startingCursor;
  const accepted = [];

  for (const change of changes) {
    const operationId = String(change.operation_id || '');
    if (!operationId) continue;

    const existing = await readJson<OperationMarker>(getOperationMarkerUrl(baseUrl, operationId), headers);
    if (existing?.cursor) {
      latestCursor = Math.max(latestCursor, Number(existing.cursor || '0'));
      accepted.push({
        operation_id: operationId,
        cursor: String(existing.cursor),
        change,
        deduplicated: true,
      });
      continue;
    }

    latestCursor += 1;
    const bucketName = getChangeBucketName(latestCursor);
    const fileName = `${String(latestCursor).padStart(8, '0')}_${change.operation_id}.json`;
    await ensureCollection(`${baseUrl}/changes/${bucketName}`, headers);
    const path = `${baseUrl}/changes/${bucketName}/${fileName}`;
    await writeJson(path, headers, change);
    await writeJson(getOperationMarkerUrl(baseUrl, operationId), headers, {
      operation_id: operationId,
      cursor: String(latestCursor),
      path,
      timestamp: new Date().toISOString(),
    } satisfies OperationMarker);
    accepted.push({
      operation_id: operationId,
      cursor: String(latestCursor),
      change,
    });
  }

  return { accepted, latestCursor };
}
