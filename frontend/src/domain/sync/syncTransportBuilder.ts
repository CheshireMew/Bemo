import { settings } from '../../store/settings.js';
import { createServerTransport } from '../../utils/serverTransport.js';
import { createWebDavTransport } from '../../utils/webdavTransport.js';

export function getSyncMode() {
  return settings.sync.mode;
}

export function getSyncTargetLabel() {
  if (settings.sync.mode === 'server') return '自部署服务器';
  if (settings.sync.mode === 'webdav') return 'WebDAV';
  return '本地';
}

export function buildSyncTransport() {
  if (settings.sync.mode === 'server' && settings.sync.serverUrl && settings.sync.accessToken) {
    return createServerTransport(settings.sync.serverUrl, settings.sync.accessToken);
  }
  if (settings.sync.mode === 'webdav' && settings.sync.webdavUrl && settings.sync.username && settings.sync.password) {
    return createWebDavTransport({
      webdavUrl: settings.sync.webdavUrl,
      username: settings.sync.username,
      password: settings.sync.password,
      basePath: settings.sync.basePath,
    });
  }
  return null;
}
