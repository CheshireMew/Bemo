import type { SyncConfigSnapshot } from './syncConfig.js';
import type { SyncTarget } from './mutationLogStorage.js';

function canonicalUrl(value: string, basePath = '') {
  const url = new URL(`${value.trim().replace(/\/+$/, '')}/${basePath.trim().replace(/^\/+|\/+$/g, '')}`);
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

/** Server storage is single-account; WebDAV additionally separates account and directory. */
export function getSyncTargetId(config: SyncConfigSnapshot, mode: SyncTarget = config.mode as SyncTarget): string | null {
  try {
    if (mode === 'server') return config.serverUrl.trim() ? `server:${canonicalUrl(config.serverUrl)}` : null;
    if (mode === 'webdav') return config.webdavUrl.trim()
      ? `webdav:${JSON.stringify([canonicalUrl(config.webdavUrl, config.basePath), config.username.trim()])}` : null;
    return null;
  } catch { return null; }
}

export function scopedSyncKey(targetId: string, name: string) {
  return `sync:${encodeURIComponent(targetId)}:${name}`;
}
