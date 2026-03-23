import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { refreshSyncPendingCounts, setSyncState } from '../domain/sync/syncStatusBus.js';
import { getSyncTargetLabel } from '../domain/sync/syncTransportBuilder.js';
import {
  hasBundledWebDavProxyAccessToken,
  hasWebDavBackendProxyAccess,
  hasWebDavBackendProxyConfig,
  shouldProxyWebDavThroughBackend,
} from '../domain/sync/webdav/webdavHttp.js';
import { saveSettings } from '../services/localSettings.js';
import { settings, type SyncMode } from '../store/settings.js';
import { pendingCount, serverPendingCount, webdavPendingCount } from '../store/sync.js';
import { requestSyncNow } from '../utils/sync.js';

const AUTO_SAVE_DELAY_MS = 400;

function getSyncModeLabel(mode: SyncMode) {
  if (mode === 'server') return '自部署服务器';
  if (mode === 'webdav') return 'WebDAV';
  return '本地模式';
}

function normalizeSyncSettings() {
  settings.sync.deviceName = settings.sync.deviceName.trim();
  settings.sync.serverUrl = settings.sync.serverUrl.trim();
  settings.sync.accessToken = settings.sync.accessToken.trim();
  settings.sync.webdavUrl = settings.sync.webdavUrl.trim();
  settings.sync.username = settings.sync.username.trim();
  settings.sync.basePath = settings.sync.basePath.trim();
}

function serializeSyncSettings() {
  return JSON.stringify({
    mode: settings.sync.mode,
    deviceName: settings.sync.deviceName,
    serverUrl: settings.sync.serverUrl,
    accessToken: settings.sync.accessToken,
    webdavUrl: settings.sync.webdavUrl,
    username: settings.sync.username,
    password: settings.sync.password,
    basePath: settings.sync.basePath,
  });
}

export function useSyncSettings(options: {
  onPersisted?: () => Promise<void> | void;
} = {}) {
  const modeSwitchNotice = ref('');
  const hasCompleteServerConfig = computed(() => {
    return Boolean(settings.sync.serverUrl.trim() && settings.sync.accessToken.trim());
  });
  const webdavConfigIssue = computed(() => {
    if (!settings.sync.webdavUrl.trim() || !settings.sync.username.trim() || !settings.sync.password.trim()) {
      return '请先填写完整的 WebDAV 地址、用户名和密码';
    }
    if (shouldProxyWebDavThroughBackend() && !hasWebDavBackendProxyConfig()) {
      return '网页端 WebDAV 需要同步服务器地址。请通过 start-dev 脚本启动，或为网页端设置 VITE_WEB_API_BASE_URL。';
    }
    if (shouldProxyWebDavThroughBackend() && !hasWebDavBackendProxyAccess()) {
      return hasBundledWebDavProxyAccessToken()
        ? ''
        : '网页端 WebDAV 需要填写同步服务器 Token，才能通过同步服务器代理访问第三方 WebDAV。';
    }
    return '';
  });
  const hasCompleteWebDavConfig = computed(() => !webdavConfigIssue.value);

  let persistTimer: number | null = null;
  let pendingSyncRequest = false;
  let lastPersistedSnapshot = serializeSyncSettings();

  const refreshSyncPresentation = () => {
    const currentPendingCount = settings.sync.mode === 'server'
      ? serverPendingCount.value
      : settings.sync.mode === 'webdav'
        ? webdavPendingCount.value
        : serverPendingCount.value + webdavPendingCount.value;

    setSyncState({
      target: getSyncTargetLabel(),
      error: '',
    });
    void refreshSyncPendingCounts(currentPendingCount);
  };

  const flushPersist = () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }

    const shouldRequestSync = pendingSyncRequest && (
      settings.sync.mode === 'local'
      || (settings.sync.mode === 'server' && hasCompleteServerConfig.value)
      || (settings.sync.mode === 'webdav' && hasCompleteWebDavConfig.value)
    );
    pendingSyncRequest = false;

    normalizeSyncSettings();
    const nextSnapshot = serializeSyncSettings();
    if (nextSnapshot !== lastPersistedSnapshot) {
      lastPersistedSnapshot = nextSnapshot;
      saveSettings();
      refreshSyncPresentation();
      void options.onPersisted?.();
    }

    if (shouldRequestSync) {
      requestSyncNow();
    }
  };

  const schedulePersist = (requestSync = false) => {
    pendingSyncRequest = pendingSyncRequest || requestSync;
    if (persistTimer) {
      clearTimeout(persistTimer);
    }
    persistTimer = window.setTimeout(() => {
      flushPersist();
    }, AUTO_SAVE_DELAY_MS);
  };

  watch(
    () => [
      settings.sync.mode,
      settings.sync.deviceName,
      settings.sync.serverUrl,
      settings.sync.accessToken,
      settings.sync.webdavUrl,
      settings.sync.username,
      settings.sync.password,
      settings.sync.basePath,
    ],
    (next, previous) => {
      const [mode] = next as [SyncMode];
      const [previousMode] = previous as [SyncMode];

      if (mode !== previousMode) {
        const previousPendingCount = previousMode === 'server'
          ? serverPendingCount.value
          : previousMode === 'webdav'
            ? webdavPendingCount.value
            : pendingCount.value;

        modeSwitchNotice.value = previousPendingCount > 0
          ? `已切换到“${getSyncModeLabel(mode)}”，原“${getSyncModeLabel(previousMode)}”仍有 ${previousPendingCount} 条待同步变更，不会自动迁移到新的同步目标。`
          : `已切换到“${getSyncModeLabel(mode)}”，后续同步会使用新的目标，旧同步队列不会自动迁移。`;
      }

      schedulePersist(mode !== previousMode);
    },
  );

  onBeforeUnmount(() => {
    flushPersist();
  });

  return {
    flushPersist,
    hasCompleteServerConfig,
    hasBundledWebDavProxyAccessToken,
    hasCompleteWebDavConfig,
    hasWebDavBackendProxyConfig,
    modeSwitchNotice,
    shouldProxyWebDavThroughBackend,
    syncSettings: settings.sync,
    webdavConfigIssue,
  };
}
