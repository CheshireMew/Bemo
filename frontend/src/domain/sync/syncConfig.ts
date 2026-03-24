import { settings } from '../settings/settingsState.js';
import type { SyncMode } from '../settings/settingsTypes.js';

export type SyncConfigSnapshot = {
  mode: SyncMode;
  deviceName: string;
  serverUrl: string;
  accessToken: string;
  webdavUrl: string;
  username: string;
  password: string;
  basePath: string;
};

function normalizeUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function normalizePath(value: string) {
  return value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function hashIdentity(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function readSyncConfigSnapshot(): SyncConfigSnapshot {
  return {
    mode: settings.sync.mode,
    deviceName: settings.sync.deviceName.trim(),
    serverUrl: settings.sync.serverUrl.trim(),
    accessToken: settings.sync.accessToken.trim(),
    webdavUrl: settings.sync.webdavUrl.trim(),
    username: settings.sync.username.trim(),
    password: settings.sync.password,
    basePath: settings.sync.basePath.trim(),
  };
}

export function getSyncTargetLabel(config: SyncConfigSnapshot = readSyncConfigSnapshot()) {
  if (config.mode === 'server') return '自部署服务器';
  if (config.mode === 'webdav') return 'WebDAV';
  return '本地';
}

export function getSyncTargetSeedFingerprint(
  target: 'server' | 'webdav',
  config: SyncConfigSnapshot = readSyncConfigSnapshot(),
) {
  if (target === 'server') {
    return `server:${hashIdentity(JSON.stringify({
      serverUrl: normalizeUrl(config.serverUrl),
      accessToken: config.accessToken,
    }))}`;
  }

  return `webdav:${hashIdentity(JSON.stringify({
    webdavUrl: normalizeUrl(config.webdavUrl),
    basePath: normalizePath(config.basePath),
    username: config.username,
  }))}`;
}
