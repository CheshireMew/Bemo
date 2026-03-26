import { Capacitor } from '@capacitor/core';

export type AppStorageMode = 'local' | 'backend';

function normalizeApiBase(url: string | undefined) {
  return (url || '').trim().replace(/\/$/, '');
}

function normalizeEnvValue(value: string | undefined) {
  return (value || '').trim();
}

function normalizeAppStorageMode(value: string | undefined): AppStorageMode | '' {
  const normalized = normalizeEnvValue(value).toLowerCase();
  if (normalized === 'local' || normalized === 'backend') {
    return normalized;
  }
  return '';
}

function getEnv() {
  return (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }).env ?? {};
}

function resolveApiBase() {
  const env = getEnv();
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
export const APP_STORAGE_MODE = (() => {
  const env = getEnv();
  const shared = normalizeAppStorageMode(env.VITE_APP_STORAGE_MODE);
  const web = normalizeAppStorageMode(env.VITE_WEB_APP_STORAGE_MODE);
  const android = normalizeAppStorageMode(env.VITE_ANDROID_APP_STORAGE_MODE);

  const platform = Capacitor.getPlatform();
  const isNative = Capacitor.isNativePlatform();

  if (platform === 'android') {
    return android || shared || 'local';
  }

  if (!isNative) {
    return web || shared || 'backend';
  }

  return shared || 'backend';
})();
export const SYNC_PROXY_TOKEN = (() => {
  const env = getEnv();
  const shared = normalizeEnvValue(env.VITE_SYNC_PROXY_TOKEN);
  const web = normalizeEnvValue(env.VITE_WEB_SYNC_PROXY_TOKEN);
  const android = normalizeEnvValue(env.VITE_ANDROID_SYNC_PROXY_TOKEN);

  const platform = Capacitor.getPlatform();
  const isNative = Capacitor.isNativePlatform();

  if (platform === 'android') {
    return android || shared || '';
  }

  if (isNative) {
    return shared || '';
  }

  return web || shared || '';
})();

export function hasBackendOrigin() {
  return Boolean(API_ORIGIN);
}

export function usesBackendAppStorage() {
  return APP_STORAGE_MODE === 'backend';
}

export function hasSyncProxyToken() {
  return Boolean(SYNC_PROXY_TOKEN);
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
