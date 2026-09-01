import { resolveBackendUrl } from '../../config.js';

export class AppApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function appRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = resolveBackendUrl(path);
  if (!url) throw new AppApiError('当前没有可用的应用服务地址。', 0);
  const response = await fetch(url, {
    ...init, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new AppApiError(typeof payload?.detail === 'string' ? payload.detail : `应用服务请求失败 (${response.status})`, response.status);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
