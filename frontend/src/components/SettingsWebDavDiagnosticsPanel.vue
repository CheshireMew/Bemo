<template>
  <article class="settings-card diagnostics-card">
    <div class="section-inline-header diagnostics-header">
      <div>
        <h4>WebDAV 完整自检</h4>
        <p>会检查连接、目录结构、远端元数据、快照分片、附件引用、本地游标，以及实际的 pull / push / blob / lease 路径。</p>
      </div>
      <button
        type="button"
        class="secondary-btn"
        :disabled="isRunning"
        @click="handleRun"
      >
        {{ isRunning ? '检测中...' : report ? '重新检测' : '开始检测' }}
      </button>
    </div>

    <div class="helper-panel helper-panel-warning">
      <strong>会有轻微写入</strong>
      <span>自检会确保同步目录存在，并写入后立刻删除一个附件探针与锁文件探针，不会改动你的笔记内容。</span>
    </div>

    <div v-if="report" class="diagnostics-summary" :class="summaryClass">
      <div class="summary-main">
        <strong>{{ summaryTitle }}</strong>
        <span>{{ summaryText }}</span>
      </div>
      <div class="summary-metrics">
        <span class="metric-pass">通过 {{ report.counts.pass }}</span>
        <span class="metric-warn">警告 {{ report.counts.warn }}</span>
        <span class="metric-fail">失败 {{ report.counts.fail }}</span>
      </div>
    </div>

    <div v-if="report" class="diagnostics-meta">
      <span>同步根目录：{{ report.baseUrl }}</span>
      <span>开始时间：{{ formatTime(report.startedAt) }}</span>
      <span>完成时间：{{ formatTime(report.finishedAt) }}</span>
    </div>

    <div v-if="report" class="diagnostics-list">
      <article
        v-for="check in report.checks"
        :key="check.id"
        class="diagnostic-item"
        :class="`diagnostic-item-${check.status}`"
      >
        <div class="diagnostic-head">
          <div class="diagnostic-title-wrap">
            <span class="diagnostic-phase">{{ phaseLabel(check.phase) }}</span>
            <strong>{{ check.title }}</strong>
          </div>
          <span class="diagnostic-badge" :class="`diagnostic-badge-${check.status}`">
            {{ statusLabel(check.status) }}
          </span>
        </div>
        <p class="diagnostic-detail">{{ check.detail }}</p>
        <ul v-if="check.facts?.length" class="diagnostic-facts">
          <li v-for="fact in check.facts" :key="fact">{{ fact }}</li>
        </ul>
      </article>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { WebDavDiagnosticReport } from '../domain/sync/webdav/webdavDiagnostics.js';
import { runWebDavDiagnostics } from '../domain/sync/webdav/webdavDiagnostics.js';
import { pushNotification } from '../store/notifications.js';

const props = defineProps<{
  syncSettings: {
    webdavUrl: string;
    username: string;
    password: string;
    basePath: string;
  };
  flushSyncSettings: () => void;
}>();

const isRunning = ref(false);
const report = ref<WebDavDiagnosticReport | null>(null);

const summaryTitle = computed(() => {
  if (!report.value) return '';
  if (report.value.summary === 'fail') return '检测到阻塞问题';
  if (report.value.summary === 'warn') return '同步可以继续，但还有隐患';
  return 'WebDAV 同步链路正常';
});

const summaryText = computed(() => {
  if (!report.value) return '';
  if (report.value.summary === 'fail') return '至少有一个问题会直接影响同步正确性或可用性。';
  if (report.value.summary === 'warn') return '当前没有直接阻塞项，但有会放大流量、拖慢恢复，或留下脏状态的点。';
  return '当前客户端能覆盖到的主要 WebDAV 风险点都已经通过。';
});

const summaryClass = computed(() => {
  if (!report.value) return '';
  if (report.value.summary === 'fail') return 'diagnostics-summary-fail';
  if (report.value.summary === 'warn') return 'diagnostics-summary-warn';
  return 'diagnostics-summary-pass';
});

function statusLabel(status: string) {
  if (status === 'pass') return '通过';
  if (status === 'warn') return '警告';
  if (status === 'fail') return '失败';
  return '跳过';
}

function phaseLabel(phase: string) {
  if (phase === 'config') return '配置';
  if (phase === 'remote') return '连通';
  if (phase === 'contract') return '结构';
  if (phase === 'storage') return '附件';
  if (phase === 'runtime') return '运行';
  return '本地';
}

function formatTime(value: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

async function handleRun() {
  try {
    isRunning.value = true;
    props.flushSyncSettings();
    report.value = await runWebDavDiagnostics({
      webdavUrl: props.syncSettings.webdavUrl,
      username: props.syncSettings.username,
      password: props.syncSettings.password,
      basePath: props.syncSettings.basePath,
    });
    if (report.value.summary === 'pass') {
      pushNotification('WebDAV 完整自检通过', 'success');
    } else if (report.value.summary === 'warn') {
      pushNotification('WebDAV 自检完成，发现一些隐患', 'info', 3600);
    } else {
      pushNotification('WebDAV 自检完成，发现阻塞问题', 'error', 3600);
    }
  } catch (error) {
    pushNotification(error instanceof Error ? error.message : 'WebDAV 自检失败', 'error', 3600);
  } finally {
    isRunning.value = false;
  }
}
</script>

<style scoped>
.diagnostics-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.diagnostics-header {
  align-items: flex-start;
}

.diagnostics-header p {
  margin: 6px 0 0;
  color: var(--text-secondary, #71717a);
  font-size: 0.92rem;
  line-height: 1.6;
}

.diagnostics-summary {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: center;
  padding: 16px 18px;
  border-radius: 16px;
  border: 1px solid var(--border-color, #e4e4e7);
}

.diagnostics-summary-pass {
  background: color-mix(in srgb, #31d279 10%, white);
  border-color: color-mix(in srgb, #31d279 40%, white);
}

.diagnostics-summary-warn {
  background: color-mix(in srgb, #f59e0b 12%, white);
  border-color: color-mix(in srgb, #f59e0b 35%, white);
}

.diagnostics-summary-fail {
  background: color-mix(in srgb, #ef4444 10%, white);
  border-color: color-mix(in srgb, #ef4444 35%, white);
}

.summary-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.summary-main strong {
  font-size: 1rem;
  color: var(--text-primary, #18181b);
}

.summary-main span {
  color: var(--text-secondary, #71717a);
  font-size: 0.92rem;
}

.summary-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
  font-size: 0.88rem;
  font-weight: 700;
}

.metric-pass {
  color: #15803d;
}

.metric-warn {
  color: #b45309;
}

.metric-fail {
  color: #b91c1c;
}

.diagnostics-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  color: var(--text-secondary, #71717a);
  font-size: 0.86rem;
}

.diagnostics-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.diagnostic-item {
  border-radius: 16px;
  border: 1px solid var(--border-color, #e4e4e7);
  background: var(--bg-main, #f4f5f7);
  padding: 16px 18px;
}

.diagnostic-item-pass {
  border-color: color-mix(in srgb, #31d279 30%, var(--border-color, #e4e4e7));
}

.diagnostic-item-warn {
  border-color: color-mix(in srgb, #f59e0b 45%, var(--border-color, #e4e4e7));
}

.diagnostic-item-fail {
  border-color: color-mix(in srgb, #ef4444 45%, var(--border-color, #e4e4e7));
}

.diagnostic-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.diagnostic-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.diagnostic-phase {
  color: var(--text-secondary, #71717a);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.diagnostic-title-wrap strong {
  color: var(--text-primary, #18181b);
  font-size: 1rem;
}

.diagnostic-badge {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.8rem;
  font-weight: 700;
}

.diagnostic-badge-pass {
  background: #dcfce7;
  color: #15803d;
}

.diagnostic-badge-warn {
  background: #ffedd5;
  color: #c2410c;
}

.diagnostic-badge-fail {
  background: #fee2e2;
  color: #b91c1c;
}

.diagnostic-detail {
  margin: 12px 0 0;
  color: var(--text-secondary, #52525b);
  line-height: 1.7;
}

.diagnostic-facts {
  margin: 12px 0 0;
  padding-left: 18px;
  color: var(--text-secondary, #71717a);
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.88rem;
}

@media (max-width: 768px) {
  .diagnostics-summary,
  .diagnostic-head,
  .diagnostics-header {
    flex-direction: column;
  }

  .summary-metrics {
    justify-content: flex-start;
  }
}
</style>
