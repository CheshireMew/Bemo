import { ensureCollection, webdavRequest } from './webdavRequest.js';

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

function toExactBlob(data: Uint8Array, mimeType: string) {
  return new Blob([Uint8Array.from(data)], { type: mimeType });
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

export async function hasWebDavBlob(baseUrl: string, headers: HeadersInit, blobHash: string) {
  const { url } = buildBlobPath(baseUrl, blobHash);
  const response = await webdavRequest(url, { method: 'HEAD', headers });
  return response.status >= 200 && response.status < 300;
}

export async function putWebDavBlob(
  baseUrl: string,
  headers: HeadersInit,
  blobHash: string,
  data: Uint8Array,
  mimeType = 'application/octet-stream',
) {
  const { algorithm, dir, url } = buildBlobPath(baseUrl, blobHash);
  await ensureCollection(`${baseUrl}/blobs/${algorithm}`, headers);
  await ensureCollection(dir, headers);
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

export async function listWebDavBlobHashes(baseUrl: string, headers: HeadersInit): Promise<string[]> {
  const requestUrl = `${baseUrl}/blobs/`;
  const response = await webdavRequest(requestUrl, {
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
  const hashes = responses.flatMap((node) => {
    const href = node.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent || '';
    const resolved = normalizeHrefToPath(href, requestUrl);
    const match = resolved.match(/\/blobs\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (!match) return [];
    const algorithm = match[1];
    const digest = match[3];
    return [`${algorithm}:${digest}`];
  });
  return Array.from(new Set(hashes)).sort();
}

export async function deleteWebDavBlob(baseUrl: string, headers: HeadersInit, blobHash: string) {
  const { url } = buildBlobPath(baseUrl, blobHash);
  const response = await webdavRequest(url, { method: 'DELETE', headers });
  return response.status === 404 || (response.status >= 200 && response.status < 300);
}
