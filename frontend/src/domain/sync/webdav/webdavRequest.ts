import { encodeBytesToBase64, webdavHttpRequest, type WebDavRequestInit } from './webdavHttp.js';

const WEBDAV_RETRY_BASE_MS = 1_000;
const WEBDAV_RETRY_MAX_MS = 10_000;
const WEBDAV_MAX_ATTEMPTS = 4;
const WEBDAV_MAX_COLLECTION_DEPTH = 12;

export function encodeBasicAuth(username: string, password: string) {
  return `Basic ${encodeBytesToBase64(new TextEncoder().encode(`${username}:${password}`))}`;
}

function normalizeKnownWebDavRoot(url: string) {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname === 'dav.jianguoyun.com'
      && (parsed.pathname === '' || parsed.pathname === '/')
    ) {
      parsed.pathname = '/dav';
      return parsed.toString().replace(/\/$/, '');
    }
  } catch {
    return url;
  }
  return url;
}

export function normalizeWebDavContainer(url: string, basePath: string) {
  const root = normalizeKnownWebDavRoot(url).replace(/\/$/, '');
  const path = basePath.replace(/^\/+|\/+$/g, '');
  return `${root}/${path ? `${path}` : ''}`.replace(/\/$/, '');
}

export function normalizeWebDavBase(url: string, basePath: string) {
  const container = normalizeWebDavContainer(url, basePath);
  return `${container}/bemo-sync`;
}

export function getWebDavStatusMessage(status: number) {
  if (status === 0) return '无法连接到 WebDAV 服务';
  if (status === 401) return '认证失败，请检查用户名或密码';
  if (status === 403) return 'WebDAV 服务拒绝访问，请检查目录权限';
  if (status === 404) return '远端路径不存在，稍后可以尝试初始化同步目录';
  if (status === 405) return 'WebDAV 服务不支持当前方法，但目录可能已经存在';
  if (status === 409) return '远端父目录不存在，请检查基础路径';
  if (status === 423) return '远端目录被锁定，请稍后重试';
  if (status === 429) return 'WebDAV 服务正在限速，请稍后重试';
  if (status >= 500) return 'WebDAV 服务端异常，请稍后重试';
  return `WebDAV 请求失败 (${status})`;
}

export class WebDavRequestError extends Error {
  status: number;
  retryAfterMs: number | null;

  constructor(
    status: number,
    options: {
      message?: string;
      retryAfterMs?: number | null;
    } = {},
  ) {
    super(options.message || getWebDavStatusMessage(status));
    this.name = 'WebDavRequestError';
    this.status = status;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

export type WebDavJsonDocument<T> = {
  value: T | null;
  etag: string | null;
  status: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseRetryAfterMs(headers?: Headers | HeadersInit | null) {
  if (!headers) return null;
  const value = headers instanceof Headers
    ? headers.get('Retry-After')
    : new Headers(headers).get('Retry-After');
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1_000, 60_000);
  }
  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) return null;
  return Math.max(0, Math.min(retryAt - Date.now(), 60_000));
}

function isRetryableStatus(status: number) {
  return status === 408
    || status === 423
    || status === 425
    || status === 429
    || status === 500
    || status === 502
    || status === 503
    || status === 504;
}

function shouldRetryTransportError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error instanceof TypeError
    || /Failed to fetch/i.test(error.message)
    || /NetworkError/i.test(error.message)
    || /upstream request failed/i.test(error.message);
}

function getBackoffDelayMs(attempt: number, headers?: Headers | HeadersInit | null) {
  const retryAfterMs = parseRetryAfterMs(headers);
  if (retryAfterMs !== null) return retryAfterMs;
  return Math.min(WEBDAV_RETRY_BASE_MS * (2 ** attempt), WEBDAV_RETRY_MAX_MS);
}

async function performWebDavRequest(url: string, init: WebDavRequestInit = {}) {
  let attempt = 0;
  let lastRetryAfterMs: number | null = null;
  while (attempt < WEBDAV_MAX_ATTEMPTS) {
    try {
      const response = await webdavHttpRequest(url, {
        cache: 'no-store',
        redirect: 'follow',
        ...init,
      });
      if (!isRetryableStatus(response.status) || attempt === WEBDAV_MAX_ATTEMPTS - 1) {
        return response;
      }
      lastRetryAfterMs = getBackoffDelayMs(attempt, response.headers);
      await sleep(lastRetryAfterMs);
      attempt += 1;
      continue;
    } catch (error) {
      if (!shouldRetryTransportError(error) || attempt === WEBDAV_MAX_ATTEMPTS - 1) {
        throw error;
      }
      lastRetryAfterMs = getBackoffDelayMs(attempt, null);
      await sleep(lastRetryAfterMs);
      attempt += 1;
    }
  }

  throw new WebDavRequestError(503, {
    retryAfterMs: lastRetryAfterMs,
  });
}

function isAcceptableStatus(status: number) {
  return (
    (status >= 200 && status < 300)
    || status === 301
    || status === 302
    || status === 404
    || status === 405
    || status === 207
  );
}

export function formatWebDavError(error: unknown) {
  if (error instanceof WebDavRequestError) return error.message;
  if (error instanceof TypeError && /Failed to fetch/i.test(error.message)) {
    return '无法连接到同步服务器代理：请确认网页端已通过 start-dev 脚本启动，或已正确设置 API_BASE，并检查后端是否正在运行。';
  }
  if (error instanceof Error) return error.message;
  return 'WebDAV 操作失败';
}

export function getStrongEtag(headers?: Headers | HeadersInit | null) {
  if (!headers) return null;
  const value = headers instanceof Headers
    ? headers.get('ETag')
    : new Headers(headers).get('ETag');
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized || normalized.startsWith('W/')) return null;
  return normalized;
}

export async function webdavRequest(url: string, init: WebDavRequestInit = {}) {
  const response = await performWebDavRequest(url, init);
  if (!isAcceptableStatus(response.status)) {
    throw new WebDavRequestError(response.status, {
      retryAfterMs: parseRetryAfterMs(response.headers),
    });
  }
  return response;
}

function getParentCollectionUrl(url: string) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.replace(/\/+$/g, '').split('/').filter(Boolean);
    if (!segments.length) return null;
    segments.pop();
    if (!segments.length) return null;
    parsed.pathname = `/${segments.join('/')}`;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export async function ensureCollection(url: string, headers: HeadersInit, remainingDepth = WEBDAV_MAX_COLLECTION_DEPTH) {
  const response = await performWebDavRequest(url, {
    method: 'MKCOL',
    headers,
  });
  if (response.ok || response.status === 405 || response.status === 301 || response.status === 302) return;
  if (response.status === 409) {
    if (remainingDepth <= 0) {
      throw new WebDavRequestError(409, {
        message: 'WebDAV 目录层级过深，或服务端持续返回父目录不存在',
      });
    }
    const parent = getParentCollectionUrl(url);
    if (!parent) {
      throw new WebDavRequestError(409);
    }
    await ensureCollection(parent, headers, remainingDepth - 1);
    await ensureCollection(url, headers, remainingDepth - 1);
    return;
  }
  throw new WebDavRequestError(response.status);
}

export async function readJsonDocument<T>(url: string, headers: HeadersInit): Promise<WebDavJsonDocument<T>> {
  const response = await webdavRequest(url, { method: 'GET', headers });
  if (response.status === 404) {
    return {
      value: null,
      etag: null,
      status: 404,
    };
  }
  return {
    value: await response.json() as T,
    etag: getStrongEtag(response.headers),
    status: response.status,
  };
}

export async function readJson<T>(url: string, headers: HeadersInit): Promise<T | null> {
  const document = await readJsonDocument<T>(url, headers);
  return document.value;
}

export async function writeJson(
  url: string,
  headers: HeadersInit,
  payload: unknown,
  options: {
    ifMatch?: string | null;
    ifNoneMatch?: string | null;
  } = {},
) {
  const response = await performWebDavRequest(url, {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      ...(options.ifMatch ? { 'If-Match': options.ifMatch } : {}),
      ...(options.ifNoneMatch ? { 'If-None-Match': options.ifNoneMatch } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new WebDavRequestError(response.status, {
      retryAfterMs: parseRetryAfterMs(response.headers),
    });
  }
}

export async function ensureWebDavLayout(baseUrl: string, headers: HeadersInit) {
  await ensureCollection(baseUrl, headers);
  await ensureCollection(`${baseUrl}/batches`, headers);
  await ensureCollection(`${baseUrl}/blobs`, headers);
  await ensureCollection(`${baseUrl}/snapshots`, headers);
}

export async function testWebDavConnection(url: string, basePath: string, headers: HeadersInit) {
  const containerUrl = normalizeWebDavContainer(url, basePath);
  const response = await webdavRequest(`${containerUrl}/`, {
    method: 'PROPFIND',
    headers: {
      ...headers,
      Depth: '0',
    },
  });

  return {
    ok: response.status === 200 || response.status === 207 || response.status === 301 || response.status === 302 || response.status === 404,
    status: response.status,
    containerUrl,
    baseUrl: normalizeWebDavBase(url, basePath),
  };
}

export async function initializeWebDavTarget(url: string, basePath: string, headers: HeadersInit) {
  const baseUrl = normalizeWebDavBase(url, basePath);
  await ensureWebDavLayout(baseUrl, headers);
  return {
    baseUrl,
  };
}
