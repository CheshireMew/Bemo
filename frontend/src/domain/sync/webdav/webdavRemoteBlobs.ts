import { collectReferencedBlobHashes } from './webdavSnapshotState.js';
import type { WebDavSnapshotNote } from './webdavTypes.js';
import { ensureCollection, WebDavRequestError, webdavRequest } from './webdavRequest.js';

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
    algorithm,
    dir: `${baseUrl}/blobs/${algorithm}/${prefix}`,
    url: `${baseUrl}/blobs/${algorithm}/${prefix}/${digest}`,
  };
}

export function getWebDavBlobCollectionUrls(baseUrl: string, blobHash: string) {
  const { algorithm, dir } = buildBlobPath(baseUrl, blobHash);
  return {
    algorithmUrl: `${baseUrl}/blobs/${algorithm}`,
    dirUrl: dir,
  };
}

function toExactBlob(data: Uint8Array, mimeType: string) {
  return new Blob([data as unknown as ArrayBufferView<ArrayBuffer>], { type: mimeType });
}

function normalizeHrefToPath(href: string, requestUrl: string) {
  const raw = decodeURIComponent(href || '');
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  }
  if (raw.startsWith('/')) {
    const base = new URL(requestUrl);
    return `${base.origin}${raw}`;
  }
  return `${requestUrl.replace(/\/$/, '')}/${raw.replace(/^\/+/, '')}`;
}

export async function putWebDavBlob(
  baseUrl: string,
  headers: HeadersInit,
  blobHash: string,
  data: Uint8Array,
  mimeType = 'application/octet-stream',
  options: {
    skipEnsureDirectories?: boolean;
  } = {},
) {
  const { algorithm, dir, url } = buildBlobPath(baseUrl, blobHash);
  if (!options.skipEnsureDirectories) {
    await ensureCollection(`${baseUrl}/blobs/${algorithm}`, headers);
    await ensureCollection(dir, headers);
  }
  const response = await webdavRequest(url, {
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
}

export async function hasWebDavBlob(baseUrl: string, headers: HeadersInit, blobHash: string) {
  const { url } = buildBlobPath(baseUrl, blobHash);
  try {
    const response = await webdavRequest(url, {
      method: 'HEAD',
      headers,
    });
    if (response.status === 405) {
      const propfindResponse = await webdavRequest(url, {
        method: 'PROPFIND',
        headers: {
          ...headers,
          Depth: '0',
          'Content-Type': 'application/xml',
        },
        body: `<?xml version="1.0"?><propfind xmlns="DAV:"><prop><getcontentlength /></prop></propfind>`,
      });
      return propfindResponse.status === 207 || (propfindResponse.status >= 200 && propfindResponse.status < 300);
    }
    return response.status >= 200 && response.status < 300;
  } catch (error) {
    if (error instanceof WebDavRequestError && error.status === 501) {
      const response = await webdavRequest(url, {
        method: 'PROPFIND',
        headers: {
          ...headers,
          Depth: '0',
          'Content-Type': 'application/xml',
        },
        body: `<?xml version="1.0"?><propfind xmlns="DAV:"><prop><getcontentlength /></prop></propfind>`,
      });
      return response.status === 207 || (response.status >= 200 && response.status < 300);
    }
    throw error;
  }
}

export async function getWebDavBlob(baseUrl: string, headers: HeadersInit, blobHash: string) {
  const { url } = buildBlobPath(baseUrl, blobHash);
  const response = await webdavRequest(url, {
    method: 'GET',
    headers,
    responseType: 'arraybuffer',
  });
  if (response.status === 404) {
    throw new Error(`WebDAV blob not found: ${blobHash}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function listPropfindPaths(requestUrl: string, headers: HeadersInit, depth: '1' | 'infinity') {
  const response = await webdavRequest(requestUrl, {
    method: 'PROPFIND',
    headers: {
      ...headers,
      Depth: depth,
      'Content-Type': 'application/xml',
    },
    body: `<?xml version="1.0"?><propfind xmlns="DAV:"><prop><resourcetype /></prop></propfind>`,
  });
  if (response.status === 404) return [] as string[];

  const xml = await response.text();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const responses = Array.from(doc.getElementsByTagNameNS('DAV:', 'response'));
  return Array.from(new Set(responses.map((node) => {
    const href = node.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent || '';
    return normalizeHrefToPath(href, requestUrl);
  }).filter(Boolean)));
}

function toDirectoryRequestUrl(path: string) {
  return path.endsWith('/') ? path : `${path}/`;
}

function collectBlobHashesFromPaths(paths: string[]) {
  const hashes = paths.flatMap((path) => {
    const match = path.match(/\/blobs\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (!match) return [];
    return [`${match[1]}:${match[3]}`];
  });
  return Array.from(new Set(hashes)).sort();
}

export async function listWebDavBlobHashes(baseUrl: string, headers: HeadersInit): Promise<string[]> {
  const requestUrl = `${baseUrl}/blobs/`;
  try {
    const paths = await listPropfindPaths(requestUrl, headers, 'infinity');
    return collectBlobHashesFromPaths(paths);
  } catch (error) {
    if (!(error instanceof WebDavRequestError) || ![400, 403, 501, 507].includes(error.status)) {
      throw error;
    }
  }

  const rootPaths = await listPropfindPaths(requestUrl, headers, '1');
  const algorithmDirs = rootPaths
    .filter((path) => path !== requestUrl.replace(/\/$/, '') && /\/blobs\/[^/]+\/?$/.test(path));
  const prefixPaths = (
    await Promise.all(
      algorithmDirs.map((path) => listPropfindPaths(toDirectoryRequestUrl(path), headers, '1')),
    )
  ).flat();
  const prefixDirs = prefixPaths
    .filter((path) => /\/blobs\/[^/]+\/[^/]+\/?$/.test(path));
  const blobPaths = (
    await Promise.all(
      prefixDirs.map((path) => listPropfindPaths(toDirectoryRequestUrl(path), headers, '1')),
    )
  ).flat();
  return collectBlobHashesFromPaths(blobPaths);
}

export async function deleteWebDavBlob(baseUrl: string, headers: HeadersInit, blobHash: string) {
  const { url } = buildBlobPath(baseUrl, blobHash);
  const response = await webdavRequest(url, { method: 'DELETE', headers });
  return response.status === 404 || (response.status >= 200 && response.status < 300);
}

export function collectRemoteBlobHashes(notes: Record<string, WebDavSnapshotNote>) {
  return collectReferencedBlobHashes(notes);
}
