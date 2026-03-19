import { Capacitor } from '@capacitor/core';

function normalizeApiBase(url: string | undefined) {
  return (url || '').trim().replace(/\/$/, '');
}

function resolveApiBase() {
  const env = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }).env ?? {};
  const shared = normalizeApiBase(env.VITE_API_BASE_URL);
  const web = normalizeApiBase(env.VITE_WEB_API_BASE_URL);
  const android = normalizeApiBase(env.VITE_ANDROID_API_BASE_URL);

  const platform = Capacitor.getPlatform();
  const isNative = Capacitor.isNativePlatform();

  if (platform === 'android') {
    return android || shared || '';
  }

  if (isNative) {
    return shared || '';
  }

  return web || shared || '';
}

export const API_BASE = resolveApiBase();
export const API_ORIGIN = API_BASE ? API_BASE.replace(/\/api\/?$/, '') : '';

export function hasBackendOrigin() {
  return Boolean(API_ORIGIN);
}

export function resolveBackendUrl(path: string) {
  if (!path) return path;
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  if (!API_ORIGIN) {
    return '';
  }
  if (path.startsWith('/')) {
    return `${API_ORIGIN}${path}`;
  }
  return `${API_ORIGIN}/${path}`;
}
