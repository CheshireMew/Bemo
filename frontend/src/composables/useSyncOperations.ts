import { onMounted, ref } from 'vue';
import { summarizePendingChange } from '../domain/sync/pendingQueueSummary.js';
import { getMutationLog } from '../domain/sync/mutationLogStorage.js';
import {
  encodeBasicAuth,
  formatWebDavError,
  initializeWebDavTarget,
  testWebDavConnection,
} from '../domain/sync/webdav/webdavRequest.js';
import { getSyncTargetSeedFingerprint } from '../domain/sync/syncConfig.js';
import { createWebDavTransport } from '../domain/sync/webdavSyncTransport.js';
import { pushNotification } from '../store/notifications.js';
import { flushPendingQueue } from '../domain/sync/syncCoordinator.js';

export function useSyncOperations(options: {
  syncSettings: {
    webdavUrl: string;
    username: string;
    password: string;
    basePath: string;
  };
  hasCompleteWebDavConfig: { value: boolean };
  webdavConfigIssue: { value: string };
  flushSyncSettings: () => void;
}) {
  const isTestingWebDav = ref(false);
  const isInitializingWebDav = ref(false);
  const isSyncingNow = ref(false);
  const isCleaningWebDav = ref(false);
  const isRefreshingQueues = ref(false);
  const webdavConnectionStatus = ref('');
  const serverPendingItems = ref<Array<ReturnType<typeof summarizePendingChange>>>([]);
  const webdavPendingItems = ref<Array<ReturnType<typeof summarizePendingChange>>>([]);

  const refreshPendingQueues = async () => {
    try {
      isRefreshingQueues.value = true;
      const [serverQueue, webdavQueue] = await Promise.all([
        getMutationLog('server'),
        getMutationLog('webdav'),
      ]);
      serverPendingItems.value = serverQueue.map(summarizePendingChange);
      webdavPendingItems.value = webdavQueue.map(summarizePendingChange);
    } finally {
      isRefreshingQueues.value = false;
    }
  };

  const getWebDavHeaders = () => ({
    Authorization: encodeBasicAuth(options.syncSettings.username.trim(), options.syncSettings.password),
  });

  const ensureWebDavConfig = () => {
    if (options.hasCompleteWebDavConfig.value) return true;
    pushNotification(
      options.webdavConfigIssue.value || '请先填写完整的 WebDAV 配置',
      'error',
    );
    return false;
  };

  const handleTestWebDav = async () => {
    if (!ensureWebDavConfig()) return;

    try {
      isTestingWebDav.value = true;
      const result = await testWebDavConnection(
        options.syncSettings.webdavUrl.trim(),
        options.syncSettings.basePath.trim(),
        getWebDavHeaders(),
      );

      webdavConnectionStatus.value = `连接成功，目标目录：${result.baseUrl}`;
      if (result.status === 404) {
        pushNotification('连接成功，但远端目录还不存在；可以继续点击“初始化远端目录”', 'info', 3600);
        return;
      }
      pushNotification('WebDAV 连接测试成功', 'success');
    } catch (error) {
      const message = formatWebDavError(error);
      webdavConnectionStatus.value = message;
      pushNotification(message, 'error', 3600);
    } finally {
      isTestingWebDav.value = false;
    }
  };

  const handleInitializeWebDav = async () => {
    if (!ensureWebDavConfig()) return;

    try {
      isInitializingWebDav.value = true;
      const result = await initializeWebDavTarget(
        options.syncSettings.webdavUrl.trim(),
        options.syncSettings.basePath.trim(),
        getWebDavHeaders(),
      );
      webdavConnectionStatus.value = `远端目录已就绪：${result.baseUrl}`;
      pushNotification('WebDAV 远端目录初始化完成', 'success');
    } catch (error) {
      const message = formatWebDavError(error);
      webdavConnectionStatus.value = message;
      pushNotification(message, 'error', 3600);
    } finally {
      isInitializingWebDav.value = false;
    }
  };

  const handleSyncNow = async () => {
    try {
      isSyncingNow.value = true;
      options.flushSyncSettings();
      await flushPendingQueue();
      await refreshPendingQueues();
      pushNotification('同步已执行', 'success');
    } catch (error) {
      pushNotification(error instanceof Error ? error.message : '同步失败', 'error', 3600);
    } finally {
      isSyncingNow.value = false;
    }
  };

  const handleCleanRemoteBlobs = async () => {
    if (!ensureWebDavConfig()) return;

    try {
      isCleaningWebDav.value = true;
      const transport = createWebDavTransport({
        webdavUrl: options.syncSettings.webdavUrl.trim(),
        username: options.syncSettings.username.trim(),
        password: options.syncSettings.password,
        basePath: options.syncSettings.basePath.trim(),
        bootstrapFingerprint: getSyncTargetSeedFingerprint('webdav', {
          mode: 'webdav',
          deviceName: '',
          serverUrl: '',
          accessToken: '',
          webdavUrl: options.syncSettings.webdavUrl.trim(),
          username: options.syncSettings.username.trim(),
          password: options.syncSettings.password,
          basePath: options.syncSettings.basePath.trim(),
        }),
      });
      const result = await transport.cleanupUnusedBlobs?.();
      if (!result) {
        throw new Error('当前同步后端不支持远端附件清理');
      }
      pushNotification(`远端附件清理完成：删除 ${result.deleted} 个，保留 ${result.retained} 个`, 'success', 3600);
    } catch (error) {
      pushNotification(error instanceof Error ? error.message : '清理远端附件失败', 'error', 3600);
    } finally {
      isCleaningWebDav.value = false;
    }
  };

  onMounted(() => {
    void refreshPendingQueues();
  });

  return {
    handleCleanRemoteBlobs,
    handleInitializeWebDav,
    handleSyncNow,
    handleTestWebDav,
    isCleaningWebDav,
    isInitializingWebDav,
    isRefreshingQueues,
    isSyncingNow,
    isTestingWebDav,
    refreshPendingQueues,
    serverPendingItems,
    webdavConnectionStatus,
    webdavPendingItems,
  };
}
