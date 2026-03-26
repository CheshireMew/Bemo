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
