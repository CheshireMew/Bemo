<template>
  <section class="settings-section">
    <div class="section-header">
      <div>
        <h3>同步</h3>
      </div>
      <span class="section-badge">{{ currentModeBadge }}</span>
    </div>

    <article class="settings-card sync-hero">
      <div class="sync-hero-main">
        <div class="sync-hero-copy">
          <h4>同步模式</h4>
        </div>
      </div>

      <div class="mode-switcher" role="radiogroup" aria-label="同步模式">
        <button
          type="button"
          class="mode-pill"
          :class="{ active: syncSettings.mode === 'local' }"
          @click="syncSettings.mode = 'local'"
        >
          本地模式
        </button>
        <button
          type="button"
          class="mode-pill"
          :class="{ active: syncSettings.mode === 'server' }"
          @click="syncSettings.mode = 'server'"
        >
          自部署服务器
        </button>
        <button
          type="button"
          class="mode-pill"
          :class="{ active: syncSettings.mode === 'webdav' }"
          @click="syncSettings.mode = 'webdav'"
        >
          WebDAV
        </button>
      </div>

      <div class="mode-summary">
        <div class="mode-summary-head">
          <strong>{{ currentModeTitle }}</strong>
          <span class="mode-summary-tag">{{ currentModeTag }}</span>
        </div>
      </div>

      <div v-if="modeSwitchNotice" class="helper-panel helper-panel-warning">
        <strong>切换提示</strong>
        <span>{{ modeSwitchNotice }}</span>
      </div>

      <div class="helper-panel">
        <strong>自动保存</strong>
        <span>同步模式和当前表单内容会自动保存，关闭设置后会继续保留。</span>
      </div>
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

        <div class="status-grid">
        <div class="status-metric">
          <span class="status-label">Server 待同步</span>
          <strong>{{ serverPendingCount }}</strong>
          <small>条变更</small>
        </div>
        <div class="status-metric">
          <span class="status-label">WebDAV 待同步</span>
          <strong>{{ webdavPendingCount }}</strong>
          <small>条变更</small>
        </div>
        <div class="status-metric">
          <span class="status-label">Server 最近同步</span>
          <strong class="status-text">{{ serverLastSyncAt || '未同步' }}</strong>
        </div>
        <div class="status-metric">
          <span class="status-label">WebDAV 最近同步</span>
          <strong class="status-text">{{ webdavLastSyncAt || '未同步' }}</strong>
        </div>
        </div>
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
        <input id="webdav-url" v-model="syncSettings.webdavUrl" type="url" placeholder="https://dav.jianguoyun.com/dav" />
      </div>

      <p class="field-hint">坚果云请填写 `https://dav.jianguoyun.com/dav`，不要只填域名根路径。</p>

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

    <article class="settings-card form-card">
      <div class="section-inline-header">
        <div>
          <h4>待同步详情</h4>
        </div>
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
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import SettingsWebDavDiagnosticsPanel from './SettingsWebDavDiagnosticsPanel.vue';
import { useSyncOperations } from '../composables/useSyncOperations';
import { useSyncSettings } from '../composables/useSyncSettings';
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

const currentModeTitle = computed(() => {
  if (syncSettings.mode === 'server') return '自部署服务器';
  if (syncSettings.mode === 'webdav') return 'WebDAV 云盘';
  return '本地模式';
});

const currentModeTag = computed(() => {
  if (syncSettings.mode === 'server') return '完整双向';
  if (syncSettings.mode === 'webdav') return shouldProxyWebDavThroughBackend() ? '经同步服务器' : '原生直连';
  return '推荐单机';
});

const currentModeBadge = computed(() => {
  if (syncSettings.mode === 'server') return '自部署服务器';
  if (syncSettings.mode === 'webdav') return 'WebDAV';
  return '本地';
});

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


.sync-hero {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.sync-hero-main {
  display: flex;
  justify-content: flex-start;
  gap: 24px;
  align-items: flex-start;
}

.sync-hero-copy {
  max-width: 720px;
}

.sync-hero-copy h4 {
  font-size: 1.18rem;
}

.mode-switcher {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px;
  border-radius: var(--radius-md, 0.5rem);
  background: var(--bg-main, #f4f5f7);
  border: 1px solid var(--border-color, #e4e4e7);
}

.mode-pill {
  flex: 1 1 0;
  min-width: 140px;
  border: none;
  border-radius: var(--radius-sm, 0.375rem);
  background: transparent;
  color: var(--text-secondary, #71717a);
  padding: 10px 14px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.95rem;
  font-weight: 500;
}

.mode-pill:hover:not(.active) {
  background: var(--border-color, #e4e4e7);
  color: var(--text-primary, #18181b);
}

.mode-pill.active {
  background: var(--accent-color, #31d279);
  color: #fff;
  font-weight: 600;
}

.mode-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 18px;
  border-radius: var(--radius-md, 0.5rem);
  background: var(--bg-main, #f4f5f7);
  border: 1px solid var(--border-color, #e4e4e7);
}

.mode-summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mode-summary-head strong {
  font-size: 1rem;
}

.mode-summary-tag {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--accent-sidebar-bg, #e6f7ef);
  color: var(--accent-color, #31d279);
  font-size: 0.82rem;
  font-weight: 700;
}

.mode-summary p {
  margin: 0;
}



.overview-grid {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
}

.device-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  border-radius: 16px;
  border: 1px solid var(--border-color, #e4e4e7);
  background: color-mix(in srgb, var(--bg-main, #f4f5f7) 72%, white);
}

.device-card input {
  width: 100%;
  border: 1px solid var(--border-color, #d4d4d8);
  background: var(--bg-card, #fff);
  color: var(--text-primary, #18181b);
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
}

.device-card input:focus {
  outline: 2px solid color-mix(in srgb, var(--accent-color, #31d279) 20%, transparent);
  border-color: var(--accent-color, #31d279);
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.status-metric {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  justify-content: space-between;
  padding: 18px;
  border-radius: 16px;
  border: 1px solid var(--border-color, #e4e4e7);
  background: color-mix(in srgb, var(--bg-main, #f4f5f7) 72%, white);
  min-height: 120px;
}

.status-label {
  color: var(--text-secondary, #71717a);
  font-size: 0.9rem;
}

.status-metric strong {
  color: var(--text-primary, #18181b);
  font-size: 1.9rem;
  line-height: 1;
}

.status-metric .status-text {
  font-size: 1rem;
  line-height: 1.5;
  word-break: break-word;
}

.status-metric small {
  color: var(--text-secondary, #71717a);
  font-size: 0.84rem;
}

.queue-card {
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: 16px;
  padding: 16px;
  background: var(--bg-main, #f4f5f7);
  min-width: 0;
}

.queue-card-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 10px;
  color: var(--text-primary, #18181b);
}

.queue-empty {
  color: var(--text-secondary, #71717a);
  font-size: 0.9rem;
}

.queue-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.queue-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e4e4e7);
  color: var(--text-secondary, #71717a);
  font-size: 0.88rem;
  word-break: break-word;
}

.queue-item strong {
  color: var(--text-primary, #18181b);
  font-size: 0.92rem;
}

@media (max-width: 768px) {
  .card-grid.two-up,
  .mode-switcher {
    grid-template-columns: 1fr;
  }

  .mode-switcher {
    flex-direction: column;
  }

  .mode-pill,
  .mode-summary-head,
  .sync-hero-main {
    width: 100%;
  }

  .mode-summary-head {
    align-items: flex-start;
  }

  .card-grid.two-up {
    grid-template-columns: 1fr;
  }

  .sync-hero-main,
  .mode-summary-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .overview-grid {
    grid-template-columns: 1fr;
  }

  .status-grid {
    grid-template-columns: 1fr;
  }

  .field-row input {
    width: 100%;
  }
}
</style>
