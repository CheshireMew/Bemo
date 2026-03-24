import {
  hasWebDavBackendProxyAccess,
  hasWebDavBackendProxyConfig,
  shouldProxyWebDavThroughBackend,
} from './webdav/webdavHttp.js';
import { createServerTransport } from './serverSyncTransport.js';
import { createWebDavTransport } from './webdavSyncTransport.js';
import {
  getSyncTargetSeedFingerprint,
  readSyncConfigSnapshot,
  type SyncConfigSnapshot,
} from './syncConfig.js';

export function buildSyncTransport(config: SyncConfigSnapshot = readSyncConfigSnapshot()) {
  if (config.mode === 'server' && config.serverUrl && config.accessToken) {
    return createServerTransport(config.serverUrl, config.accessToken);
  }
  if (config.mode === 'webdav' && config.webdavUrl && config.username && config.password) {
    if (shouldProxyWebDavThroughBackend() && (!hasWebDavBackendProxyConfig() || !hasWebDavBackendProxyAccess())) {
      return null;
    }
    return createWebDavTransport({
      webdavUrl: config.webdavUrl,
      username: config.username,
      password: config.password,
      basePath: config.basePath,
      bootstrapFingerprint: getSyncTargetSeedFingerprint('webdav', config),
    });
  }
  return null;
}
