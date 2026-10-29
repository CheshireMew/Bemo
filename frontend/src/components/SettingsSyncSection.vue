<template>
  <section class="settings-section">
    <div class="section-header">
      <div>
        <h3>同步</h3>
      </div>
    </div>

    <article class="settings-card sync-hero">
      <h4>同步模式</h4>

      <div class="mode-switcher" role="radiogroup" aria-label="同步模式" @keydown="handleModeKeydown">
        <button
          type="button"
          role="radio"
          :aria-checked="syncSettings.mode === 'local'"
          :tabindex="syncSettings.mode === 'local' ? 0 : -1"
          class="mode-pill"
          :class="{ active: syncSettings.mode === 'local' }"
          @click="syncSettings.mode = 'local'"
        >
          本地模式
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="syncSettings.mode === 'server'"
          :tabindex="syncSettings.mode === 'server' ? 0 : -1"
          class="mode-pill"
          :class="{ active: syncSettings.mode === 'server' }"
          @click="syncSettings.mode = 'server'"
        >
          自部署服务器
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="syncSettings.mode === 'webdav'"
          :tabindex="syncSettings.mode === 'webdav' ? 0 : -1"
          class="mode-pill"
          :class="{ active: syncSettings.mode === 'webdav' }"
          @click="syncSettings.mode = 'webdav'"
        >
          WebDAV
        </button>
      </div>

      <div v-if="modeSwitchNotice" class="helper-panel helper-panel-warning">
        <strong>切换提示</strong>
        <span>{{ modeSwitchNotice }}</span>
      </div>

      <p class="field-hint">设置会自动保存。</p>
    </article>

    <article class="settings-card form-card">
      <div class="section-inline-header">
        <div>
          <h4>同步概览</h4>
        </div>
      </div>

      <div class="overview-grid">
        <label class="device-card">
          <span class="field-label">设备名称</span>
          <input id="device-name" v-model="syncSettings.deviceName" type="text" />
        </label>

        <dl class="sync-status-list">
          <div><dt>Server 待同步</dt><dd>{{ serverPendingCount }} 条</dd></div>
          <div><dt>Server 最近同步</dt><dd>{{ serverLastSyncAt || '未同步' }}</dd></div>
          <div><dt>WebDAV 待同步</dt><dd>{{ webdavPendingCount }} 条</dd></div>
          <div><dt>WebDAV 最近同步</dt><dd>{{ webdavLastSyncAt || '未同步' }}</dd></div>
        </dl>
      </div>

      <div v-if="syncError" class="helper-panel helper-panel-danger">
        <strong>最近错误</strong>
        <span>{{ syncError }}</span>
      </div>
    </article>

    <article v-if="syncSettings.mode === 'server'" class="settings-card form-card">
      <h4>服务器配置</h4>

      <div class="field-row">
        <div>
          <label class="field-label" for="server-url">服务器地址</label>
        </div>
        <input id="server-url" v-model="syncSettings.serverUrl" type="url" placeholder="https://your-bemo.example.com" />
      </div>

      <div class="field-row">
        <div>
          <label class="field-label" for="access-token">访问 Token</label>
        </div>
        <input id="access-token" v-model="syncSettings.accessToken" type="password" />
      </div>
    </article>

    <article v-if="syncSettings.mode === 'webdav'" class="settings-card form-card">
      <h4>WebDAV 配置</h4>

      <div class="field-row">
        <div>
          <label class="field-label" for="webdav-url">WebDAV 地址</label>
        </div>
        <input id="webdav-url" v-model="syncSettings.webdavUrl" type="url" :placeholder="webdavUrlPlaceholder" />
      </div>

      <p class="field-hint">{{ webdavProviderHint }}</p>

      <div class="field-row">
        <div>
          <label class="field-label" for="webdav-username">用户名</label>
        </div>
        <input id="webdav-username" v-model="syncSettings.username" type="text" />
      </div>

      <div class="field-row">
        <div>
          <label class="field-label" for="webdav-password">密码</label>
        </div>
        <input id="webdav-password" v-model="syncSettings.password" type="password" />
      </div>

      <div class="field-row">
        <div>
          <label class="field-label" for="webdav-base-path">基础路径</label>
        </div>
        <input id="webdav-base-path" v-model="syncSettings.basePath" type="text" placeholder="可留空" />
      </div>

      <div v-if="shouldProxyWebDavThroughBackend() && !hasBundledWebDavProxyAccessToken()" class="field-row">
        <div>
          <label class="field-label" for="webdav-proxy-token">同步服务器 Token</label>
        </div>
        <input id="webdav-proxy-token" v-model="syncSettings.accessToken" type="password" placeholder="网页端通过后端代理访问 WebDAV 时必填" />
      </div>

      <p v-if="shouldProxyWebDavThroughBackend()" class="field-hint">
        网页端 WebDAV 会经由同步服务器代理转发。原因不是 WebDAV 归后端所有，而是很多第三方 WebDAV 服务不放开浏览器 CORS，网页端无法稳定直连。
      </p>

      <div v-if="shouldProxyWebDavThroughBackend() && hasBundledWebDavProxyAccessToken()" class="helper-panel">
        <strong>已注入开发环境 Token</strong>
        <span>当前启动脚本已经为网页端注入同步服务器 Token，本地开发时不需要再手动填写。</span>
      </div>

      <div v-if="shouldProxyWebDavThroughBackend() && !hasWebDavBackendProxyConfig()" class="helper-panel helper-panel-warning">
        <strong>需要同步服务器地址</strong>
        <span>当前网页构建没有可用的 API_BASE。请通过 `start-dev` 脚本启动，或为网页端设置 `VITE_WEB_API_BASE_URL`。</span>
      </div>

      <div class="button-row">
        <button type="button" class="secondary-btn" :disabled="!hasCompleteWebDavConfig || isTestingWebDav" @click="handleTestWebDav">
          {{ isTestingWebDav ? '连接测试中...' : '测试连接' }}
        </button>
        <button
          type="button"
          class="secondary-btn"
          :disabled="!hasCompleteWebDavConfig || isInitializingWebDav"
          @click="handleInitializeWebDav"
        >
          {{ isInitializingWebDav ? '初始化中...' : '初始化目录' }}
        </button>
        <button type="button" class="primary-btn" :disabled="isSyncingNow" @click="handleSyncNow">
          {{ isSyncingNow ? '同步中...' : '立即同步' }}
        </button>
        <button
          type="button"
          class="secondary-btn"
          :disabled="!hasCompleteWebDavConfig || isCleaningWebDav"
          @click="handleCleanRemoteBlobs"
        >
          {{ isCleaningWebDav ? '清理中...' : '清理远端附件' }}
        </button>
      </div>

      <div v-if="webdavConnectionStatus" class="helper-panel">
        <strong>连接探测</strong>
        <span>{{ webdavConnectionStatus }}</span>
      </div>

    </article>

    <SettingsWebDavDiagnosticsPanel
      v-if="syncSettings.mode === 'webdav'"
      :sync-settings="syncSettings"
      :flush-sync-settings="flushPersist"
    />

    <details class="settings-card queue-details">
      <summary>待同步详情 <span>{{ serverPendingCount + webdavPendingCount }} 条</span></summary>
      <div class="section-inline-header">
        <button type="button" class="secondary-btn" :disabled="isRefreshingQueues" @click="refreshPendingQueues">
          {{ isRefreshingQueues ? '刷新中...' : '刷新' }}
        </button>
      </div>

      <div class="card-grid two-up">
        <section class="queue-card">
          <div class="queue-card-header">
            <strong>Server</strong>
            <span>{{ serverPendingItems.length }} 条</span>
          </div>
          <div v-if="serverPendingItems.length === 0" class="queue-empty">当前没有待同步操作。</div>
          <ul v-else class="queue-list">
            <li v-for="item in serverPendingItems" :key="item.operationId" class="queue-item">
              <strong>{{ item.typeLabel }}</strong>
              <span>笔记：{{ item.entityId }}</span>
              <span>基线修订：{{ item.baseRevision }}</span>
              <span>时间：{{ item.timestamp }}</span>
            </li>
          </ul>
        </section>

        <section class="queue-card">
          <div class="queue-card-header">
            <strong>WebDAV</strong>
            <span>{{ webdavPendingItems.length }} 条</span>
          </div>
          <div v-if="webdavPendingItems.length === 0" class="queue-empty">当前没有待同步操作。</div>
          <ul v-else class="queue-list">
            <li v-for="item in webdavPendingItems" :key="item.operationId" class="queue-item">
              <strong>{{ item.typeLabel }}</strong>
              <span>笔记：{{ item.entityId }}</span>
              <span>基线修订：{{ item.baseRevision }}</span>
              <span>时间：{{ item.timestamp }}</span>
            </li>
          </ul>
        </section>
      </div>
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import SettingsWebDavDiagnosticsPanel from './SettingsWebDavDiagnosticsPanel.vue';
import { useSyncOperations } from '../composables/useSyncOperations';
import { useSyncSettings } from '../composables/useSyncSettings';
import { getWebDavProviderHint, getWebDavUrlPlaceholder } from '../domain/sync/webdav/webdavProviders.js';
import {
  serverLastSyncAt,
  serverPendingCount,
  syncError,
  webdavLastSyncAt,
  webdavPendingCount,
} from '../store/sync';
const {
  flushPersist,
  hasBundledWebDavProxyAccessToken,
  hasCompleteWebDavConfig,
  hasWebDavBackendProxyConfig,
  modeSwitchNotice,
  shouldProxyWebDavThroughBackend,
  syncSettings,
  webdavConfigIssue,
} = useSyncSettings();

const handleModeKeydown = (event: KeyboardEvent) => {
  const buttons = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  const current = buttons.indexOf(event.target as HTMLButtonElement);
  if (current < 0) return;
  let next = current;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % buttons.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = buttons.length - 1;
  else return;
  event.preventDefault();
  buttons[next]?.focus();
  buttons[next]?.click();
};

const webdavUrlPlaceholder = computed(() => getWebDavUrlPlaceholder(syncSettings.webdavUrl));
const webdavProviderHint = computed(() => getWebDavProviderHint(syncSettings.webdavUrl));

const {
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
} = useSyncOperations({
  syncSettings,
  hasCompleteWebDavConfig,
  flushSyncSettings: flushPersist,
  webdavConfigIssue,
});
</script>

<style scoped>
.sync-hero { gap: 16px; }
.mode-switcher { display: flex; gap: 4px; padding: 4px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--surface-muted); }
.mode-pill { flex: 1; min-width: 0; min-height: 44px; padding: 10px 12px; border: none; border-radius: var(--radius-sm); background: transparent; color: var(--text-secondary); font-size: var(--font-size-supporting); font-weight: 500; cursor: pointer; transition: color 0.15s, background-color 0.15s; }
.mode-pill:hover:not(.active) { background: var(--surface-hover); color: var(--text-primary); }
.mode-pill.active { background: var(--accent-color); color: var(--accent-foreground); font-weight: 600; }
.overview-grid { display: grid; gap: 20px; margin-top: 18px; }
.device-card { display: grid; grid-template-columns: minmax(0, 1fr) minmax(180px, 1fr); gap: 16px; align-items: center; }
.device-card input { min-width: 0; width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-card); color: var(--text-primary); }
.sync-status-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 24px; }
.sync-status-list > div { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 12px; padding: 12px 0; border-top: 1px solid var(--border-color); font-size: var(--font-size-small); }
.sync-status-list dt { color: var(--text-secondary); }
.sync-status-list dd { color: var(--text-primary); font-weight: 500; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.form-card > .helper-panel { margin-top: 16px; }
.queue-details { display: block; }
.queue-details summary { cursor: pointer; color: var(--text-primary); font-weight: 600; min-height: 28px; line-height: 28px; }
.queue-details summary span { float: right; color: var(--text-secondary); font-size: var(--font-size-small); font-weight: 400; font-variant-numeric: tabular-nums; }
.queue-details > .section-inline-header { justify-content: flex-end; margin: 12px 0; }
.queue-card { min-width: 0; }
.queue-card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--border-color); font-size: var(--font-size-supporting); }
.queue-card-header span, .queue-empty { color: var(--text-secondary); font-size: var(--font-size-small); }
.queue-empty { padding: 14px 0; }
.queue-list { list-style: none; }
.queue-item { display: flex; flex-direction: column; gap: 4px; padding: 14px 0; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); font-size: var(--font-size-small); overflow-wrap: anywhere; }
.queue-item strong { color: var(--text-primary); }
@container settings (max-width: 540px) {
  .sync-status-list { grid-template-columns: 1fr; }
  .device-card { grid-template-columns: 1fr; gap: 8px; }
  .mode-switcher { flex-direction: column; }
  .mode-pill { flex: auto; }
}
</style>
