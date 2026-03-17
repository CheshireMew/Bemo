<template>
  <section class="settings-section">
    <div class="section-header">
      <div>
        <h3>同步</h3>
        <p>配置本地模式、自部署同步服务或 WebDAV 云盘同步。</p>
      </div>
      <span class="section-badge">{{ syncTarget }}</span>
    </div>

    <div class="card-grid two-up">
      <article class="settings-card">
        <h4>同步模式</h4>
        <p>本地模式不会连接远端；其余模式会把本地变更同步到目标。</p>
        <div class="mode-grid" role="radiogroup" aria-label="同步模式">
          <button
            type="button"
            class="mode-card"
            :class="{ active: settings.sync.mode === 'local' }"
            @click="setMode('local')"
          >
            <strong>本地模式</strong>
            <span>仅保留本机数据，不连接远端。</span>
          </button>
          <button
            type="button"
            class="mode-card"
            :class="{ active: settings.sync.mode === 'server' }"
            @click="setMode('server')"
          >
            <strong>自部署服务器</strong>
            <span>连接你自己的 Bemo Sync Server。</span>
          </button>
          <button
            type="button"
            class="mode-card"
            :class="{ active: settings.sync.mode === 'webdav' }"
            @click="setMode('webdav')"
          >
            <strong>WebDAV</strong>
            <span>连接坚果云、Nextcloud 等 WebDAV 云盘。</span>
          </button>
        </div>
      </article>

      <article class="settings-card form-card">
        <h4>设备与状态</h4>
        <div class="field-row">
          <div>
            <label class="field-label" for="device-name">设备名称</label>
            <p class="field-hint">用于标识同步来源，例如 Desktop / iPhone。</p>
          </div>
          <input id="device-name" v-model="settings.sync.deviceName" type="text" @change="persist" />
        </div>

        <div class="status-stack">
          <div class="status-item">
            <span class="status-label">Server 最近同步</span>
            <strong>{{ serverLastSyncAt || '未同步' }}</strong>
          </div>
          <div class="status-item">
            <span class="status-label">WebDAV 最近同步</span>
            <strong>{{ webdavLastSyncAt || '未同步' }}</strong>
          </div>
          <div v-if="syncError" class="status-item status-item-error">
            <span class="status-label">最近错误</span>
            <strong>{{ syncError }}</strong>
          </div>
        </div>
      </article>
    </div>

    <article v-if="settings.sync.mode === 'server'" class="settings-card form-card">
      <h4>服务器配置</h4>
      <p>适合你自己部署 Bemo Sync Server 的场景。</p>

      <div class="field-row">
        <div>
          <label class="field-label" for="server-url">服务器地址</label>
          <p class="field-hint">例如 `https://your-bemo.example.com`。</p>
        </div>
        <input id="server-url" v-model="settings.sync.serverUrl" type="url" @change="persist" />
      </div>

      <div class="field-row">
        <div>
          <label class="field-label" for="access-token">访问 Token</label>
          <p class="field-hint">对应服务端 `BEMO_SYNC_TOKEN`。</p>
        </div>
        <input id="access-token" v-model="settings.sync.accessToken" type="password" @change="persist" />
      </div>
    </article>

    <article v-if="settings.sync.mode === 'webdav'" class="settings-card form-card">
      <h4>WebDAV 配置</h4>
      <p>适合坚果云、Nextcloud、群晖等提供 WebDAV 接口的同步空间。</p>

      <div class="field-row">
        <div>
          <label class="field-label" for="webdav-url">WebDAV 地址</label>
          <p class="field-hint">填写 WebDAV 根路径或应用专用路径。</p>
        </div>
        <input id="webdav-url" v-model="settings.sync.webdavUrl" type="url" @change="persist" />
      </div>

      <div class="field-row">
        <div>
          <label class="field-label" for="webdav-username">用户名</label>
          <p class="field-hint">通常是账号名或应用用户名。</p>
        </div>
        <input id="webdav-username" v-model="settings.sync.username" type="text" @change="persist" />
      </div>

      <div class="field-row">
        <div>
          <label class="field-label" for="webdav-password">密码 / 应用密码</label>
          <p class="field-hint">建议使用应用专用密码，而不是主密码。</p>
        </div>
        <input id="webdav-password" v-model="settings.sync.password" type="password" @change="persist" />
      </div>

      <div class="field-row">
        <div>
          <label class="field-label" for="webdav-base-path">基础路径</label>
          <p class="field-hint">可留空；最终会在其下创建 `bemo-sync` 目录。</p>
        </div>
        <input id="webdav-base-path" v-model="settings.sync.basePath" type="text" @change="persist" />
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { saveSettings } from '../services/localSettings';
import { settings } from '../store/settings';
import { serverLastSyncAt, syncError, syncTarget, webdavLastSyncAt } from '../store/sync';
import { requestSyncNow } from '../utils/sync';

const persist = () => {
  saveSettings();
  requestSyncNow();
};

const setMode = (mode: 'local' | 'server' | 'webdav') => {
  if (settings.sync.mode === mode) return;
  settings.sync.mode = mode;
  persist();
};
</script>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.section-header h3,
.settings-card h4 {
  margin: 0;
  color: var(--text-primary, #18181b);
}

.section-header p,
.settings-card p,
.field-hint {
  margin: 6px 0 0;
  color: var(--text-secondary, #71717a);
  font-size: 0.92rem;
  line-height: 1.5;
}

.section-badge {
  background: var(--accent-sidebar-bg, #e6f7ef);
  color: var(--accent-color, #31d279);
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  align-self: flex-start;
}

.card-grid {
  display: grid;
  gap: 16px;
}

.card-grid.two-up {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.settings-card {
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: var(--radius-lg, 0.75rem);
  padding: 18px;
}

.form-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.mode-card {
  border: 1px solid var(--border-color, #d4d4d8);
  border-radius: 12px;
  background: var(--bg-card, #ffffff);
  color: var(--text-primary, #18181b);
  padding: 14px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mode-card strong {
  font-size: 0.96rem;
}

.mode-card span {
  color: var(--text-secondary, #71717a);
  font-size: 0.88rem;
  line-height: 1.45;
}

.mode-card:hover {
  border-color: color-mix(in srgb, var(--accent-color, #31d279) 35%, var(--border-color, #d4d4d8));
  background: color-mix(in srgb, var(--accent-sidebar-bg, #e6f7ef) 42%, white);
}

.mode-card.active {
  border-color: var(--accent-color, #31d279);
  background: color-mix(in srgb, var(--accent-sidebar-bg, #e6f7ef) 70%, white);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-color, #31d279) 18%, transparent);
}

.field-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.field-label {
  display: block;
  font-weight: 600;
  color: var(--text-primary, #18181b);
}

.field-row input {
  min-width: 220px;
  border: 1px solid var(--border-color, #d4d4d8);
  background: var(--bg-card, #fff);
  color: var(--text-primary, #18181b);
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
}

.field-row input:focus {
  outline: 2px solid color-mix(in srgb, var(--accent-color, #31d279) 20%, transparent);
  border-color: var(--accent-color, #31d279);
}

.status-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--bg-main, #f4f5f7);
}

.status-label {
  color: var(--text-secondary, #71717a);
  font-size: 0.9rem;
}

.status-item strong {
  color: var(--text-primary, #18181b);
  font-size: 0.92rem;
}

.status-item-error {
  border-color: color-mix(in srgb, #dc2626 30%, var(--border-color, #e4e4e7));
  background: #fff7f7;
}

.status-item-error strong {
  color: #b91c1c;
}

@media (max-width: 768px) {
  .card-grid.two-up,
  .mode-grid {
    grid-template-columns: 1fr;
  }

  .field-row,
  .status-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .field-row input {
    width: 100%;
  }
}
</style>
