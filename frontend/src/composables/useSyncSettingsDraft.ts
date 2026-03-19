import { computed, reactive, watch } from 'vue';
import { saveSettings } from '../services/localSettings.js';
import { pushNotification } from '../store/notifications.js';
import { settings, type SyncMode } from '../store/settings.js';
import { pendingCount, syncTarget } from '../store/sync.js';
import { requestSyncNow } from '../utils/sync.js';

export function useSyncSettingsDraft(options: {
  onSaved?: () => Promise<void> | void;
  onReset?: () => void;
}) {
  const draftSync = reactive({
    mode: settings.sync.mode,
    deviceName: settings.sync.deviceName,
    serverUrl: settings.sync.serverUrl,
    accessToken: settings.sync.accessToken,
    webdavUrl: settings.sync.webdavUrl,
    username: settings.sync.username,
    password: settings.sync.password,
    basePath: settings.sync.basePath,
  });

  watch(
    () => ({ ...settings.sync }),
    (next) => {
      draftSync.mode = next.mode;
      draftSync.deviceName = next.deviceName;
      draftSync.serverUrl = next.serverUrl;
      draftSync.accessToken = next.accessToken;
      draftSync.webdavUrl = next.webdavUrl;
      draftSync.username = next.username;
      draftSync.password = next.password;
      draftSync.basePath = next.basePath;
    },
    { immediate: true },
  );

  const isSyncDirty = computed(() => {
    return (
      draftSync.mode !== settings.sync.mode
      || draftSync.deviceName !== settings.sync.deviceName
      || draftSync.serverUrl !== settings.sync.serverUrl
      || draftSync.accessToken !== settings.sync.accessToken
      || draftSync.webdavUrl !== settings.sync.webdavUrl
      || draftSync.username !== settings.sync.username
      || draftSync.password !== settings.sync.password
      || draftSync.basePath !== settings.sync.basePath
    );
  });

  const hasCompleteWebDavConfig = computed(() => {
    return Boolean(
      draftSync.webdavUrl.trim()
      && draftSync.username.trim()
      && draftSync.password.trim(),
    );
  });

  const modeSwitchNotice = computed(() => {
    if (draftSync.mode === settings.sync.mode) return '';

    if (pendingCount.value > 0) {
      return `当前“${syncTarget.value}”还有 ${pendingCount.value} 条待同步变更。保存后只会切换后续同步目标，这些待同步变更不会自动迁移到新的同步后端。`;
    }

    return `保存后会切换后续同步目标，但不会把旧同步后端的历史队列自动迁移到“${draftSync.mode === 'server' ? '自部署服务器' : draftSync.mode === 'webdav' ? 'WebDAV' : '本地模式'}”。`;
  });

  const persist = () => {
    saveSettings();
    requestSyncNow();
  };

  const commitDraftToSettings = () => {
    settings.sync.mode = draftSync.mode;
    settings.sync.deviceName = draftSync.deviceName.trim();
    settings.sync.serverUrl = draftSync.serverUrl.trim();
    settings.sync.accessToken = draftSync.accessToken.trim();
    settings.sync.webdavUrl = draftSync.webdavUrl.trim();
    settings.sync.username = draftSync.username.trim();
    settings.sync.password = draftSync.password;
    settings.sync.basePath = draftSync.basePath.trim();
  };

  const saveSyncConfig = async () => {
    const previousMode = settings.sync.mode;
    const previousTargetLabel = syncTarget.value;
    const pendingBeforeSwitch = pendingCount.value;
    commitDraftToSettings();
    persist();
    pushNotification('同步配置已保存', 'success');
    if (previousMode !== draftSync.mode) {
      if (pendingBeforeSwitch > 0) {
        pushNotification(
          `已切换同步目标；原“${previousTargetLabel}”仍有 ${pendingBeforeSwitch} 条待同步变更，不会自动迁移到新后端。`,
          'info',
          4800,
        );
      } else {
        pushNotification('已切换同步目标；旧同步队列不会自动迁移到新后端。', 'info', 4200);
      }
    }
    await options.onSaved?.();
  };

  const resetDraft = () => {
    draftSync.mode = settings.sync.mode;
    draftSync.deviceName = settings.sync.deviceName;
    draftSync.serverUrl = settings.sync.serverUrl;
    draftSync.accessToken = settings.sync.accessToken;
    draftSync.webdavUrl = settings.sync.webdavUrl;
    draftSync.username = settings.sync.username;
    draftSync.password = settings.sync.password;
    draftSync.basePath = settings.sync.basePath;
    options.onReset?.();
  };

  const setMode = (mode: SyncMode) => {
    if (draftSync.mode === mode) return;
    draftSync.mode = mode;
  };

  return {
    commitDraftToSettings,
    draftSync,
    hasCompleteWebDavConfig,
    isSyncDirty,
    modeSwitchNotice,
    resetDraft,
    saveSyncConfig,
    setMode,
  };
}
