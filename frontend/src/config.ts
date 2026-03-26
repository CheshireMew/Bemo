import { Capacitor } from '@capacitor/core';

export type AppStorageMode = 'local' | 'backend';
type RuntimeConfigOverride = {
  apiBase?: string;
  appStorageMode?: AppStorageMode;
  syncProxyToken?: string;
};

type ResolvedRuntimeConfig = {
  apiBase: string;
  apiOrigin: string;
  appStorageMode: AppStorageMode;
  syncProxyToken: string;
};

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

function getRuntimeConfigOverride(): RuntimeConfigOverride {
  const runtime = globalThis as typeof globalThis & {
    __BEMO_RUNTIME_CONFIG__?: RuntimeConfigOverride;
  };
  return runtime.__BEMO_RUNTIME_CONFIG__ || {};
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

function resolveAppStorageMode(): AppStorageMode {
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
    return (web || shared || 'backend') as AppStorageMode;
  }

  return (shared || 'backend') as AppStorageMode;
}

function resolveSyncProxyToken() {
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
}

export function readRuntimeConfig(): ResolvedRuntimeConfig {
  const override = getRuntimeConfigOverride();
  const apiBase = normalizeApiBase(override.apiBase) || resolveApiBase();
  const appStorageMode = normalizeAppStorageMode(override.appStorageMode) || resolveAppStorageMode();
  const syncProxyToken = normalizeEnvValue(override.syncProxyToken) || resolveSyncProxyToken();
  return {
    apiBase,
    apiOrigin: apiBase ? apiBase.replace(/\/api\/?$/, '') : '',
    appStorageMode,
    syncProxyToken,
  };
}

export const API_BASE = readRuntimeConfig().apiBase;
export const API_ORIGIN = readRuntimeConfig().apiOrigin;
export const APP_STORAGE_MODE = readRuntimeConfig().appStorageMode;
export const SYNC_PROXY_TOKEN = readRuntimeConfig().syncProxyToken;

export function setRuntimeConfigOverride(override: RuntimeConfigOverride) {
  const runtime = globalThis as typeof globalThis & {
    __BEMO_RUNTIME_CONFIG__?: RuntimeConfigOverride;
  };
  runtime.__BEMO_RUNTIME_CONFIG__ = {
    ...runtime.__BEMO_RUNTIME_CONFIG__,
    ...override,
  };
}

export function clearRuntimeConfigOverride() {
  delete (globalThis as typeof globalThis & {
    __BEMO_RUNTIME_CONFIG__?: RuntimeConfigOverride;
  }).__BEMO_RUNTIME_CONFIG__;
}

export function getAppStorageMode() {
  return readRuntimeConfig().appStorageMode;
}

export function getSyncProxyToken() {
  return readRuntimeConfig().syncProxyToken;
}

export function hasBackendOrigin() {
  return Boolean(readRuntimeConfig().apiOrigin);
}

export function usesBackendAppStorage() {
  return readRuntimeConfig().appStorageMode === 'backend';
}

export function hasSyncProxyToken() {
  return Boolean(readRuntimeConfig().syncProxyToken);
}

export function resolveBackendUrl(path: string) {
  if (!path) return path;
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  const { apiOrigin } = readRuntimeConfig();
  if (!apiOrigin) {
    return '';
  }
  if (path.startsWith('/')) {
    return `${apiOrigin}${path}`;
  }
  return `${apiOrigin}/${path}`;
}
