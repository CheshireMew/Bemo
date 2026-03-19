export function encodeBasicAuth(username: string, password: string) {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

export function normalizeWebDavContainer(url: string, basePath: string) {
  const root = url.replace(/\/$/, '');
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
  if (status >= 500) return 'WebDAV 服务端异常，请稍后重试';
  return `WebDAV 请求失败 (${status})`;
}

export class WebDavRequestError extends Error {
  status: number;

  constructor(status: number, message = getWebDavStatusMessage(status)) {
    super(message);
    this.name = 'WebDavRequestError';
    this.status = status;
  }
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
  if (error instanceof Error) return error.message;
  return 'WebDAV 操作失败';
}

export async function webdavRequest(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    redirect: 'follow',
    ...init,
  });
  if (!isAcceptableStatus(response.status)) {
    throw new WebDavRequestError(response.status);
  }
  return response;
}

export async function ensureCollection(url: string, headers: HeadersInit) {
  const response = await fetch(url, {
    method: 'MKCOL',
    headers,
    cache: 'no-store',
    redirect: 'follow',
  });
  if (response.ok || response.status === 405 || response.status === 301 || response.status === 302) return;
  if (response.status === 409) {
    const parent = url.slice(0, url.lastIndexOf('/'));
    if (parent && parent !== url) {
      await ensureCollection(parent, headers);
      await ensureCollection(url, headers);
      return;
    }
  }
  throw new WebDavRequestError(response.status);
}

export async function readJson<T>(url: string, headers: HeadersInit): Promise<T | null> {
  const response = await webdavRequest(url, { method: 'GET', headers });
  if (response.status === 404) return null;
  return response.json() as Promise<T>;
}

export async function writeJson(url: string, headers: HeadersInit, payload: unknown) {
  const response = await fetch(url, {
    method: 'PUT',
    cache: 'no-store',
    redirect: 'follow',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new WebDavRequestError(response.status);
  }
}

export async function ensureWebDavLayout(baseUrl: string, headers: HeadersInit) {
  await ensureCollection(baseUrl, headers);
  await ensureCollection(`${baseUrl}/changes`, headers);
  await ensureCollection(`${baseUrl}/blobs`, headers);
  await ensureCollection(`${baseUrl}/operations`, headers);
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
