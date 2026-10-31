<template>
  <section ref="viewRef" class="conflict-view" :aria-busy="isLoading">
    <div class="conflict-header">
      <h3 ref="headingRef" tabindex="-1">冲突记录</h3>
      <span class="conflict-count" v-if="conflicts.length">{{ conflicts.length }} 条</span>
    </div>
    <div v-if="loadError" class="conflict-error" role="alert">
      <span>{{ loadError }}</span>
      <button type="button" class="conflict-action" :disabled="isLoading" @click="loadConflicts">重试</button>
    </div>
    <div v-if="isLoading && !conflicts.length" class="conflict-empty" role="status">正在读取冲突记录…</div>
    <div v-else-if="!conflicts.length && !loadError" class="conflict-empty" role="status">当前没有未处理的同步冲突。</div>

    <article v-for="item in conflicts" :key="item.id" :data-conflict-id="item.id" class="conflict-card" :aria-busy="pendingIds.has(item.id)">
      <div class="conflict-row">
        <strong>{{ item.source === 'server' ? '服务器同步' : 'WebDAV 同步' }}</strong>
        <span class="conflict-reason">{{ formatReason(item) }}</span>
      </div>
      <p v-if="item.actionLabel" class="conflict-meta">{{ item.actionLabel }}</p>
      <p v-if="item.conflictCopyFilename || item.detail.conflict_copy_filename" class="conflict-tip">
        已生成冲突副本：{{ item.conflictCopyFilename || String(item.detail.conflict_copy_filename) }}
      </p>

      <div v-if="snapshotEntries(item).length" class="conflict-comparison">
        <section v-for="snapshot in snapshotEntries(item)" :key="snapshot.label" class="conflict-version">
          <h4>{{ snapshot.label }}</h4>
          <p v-if="snapshot.value.purged" class="snapshot-state">已永久删除</p>
          <p v-else-if="snapshot.value.deleted || snapshot.value.trashed" class="snapshot-state">已移到回收站</p>
          <p class="snapshot-content">{{ typeof snapshot.value.content === 'string' ? snapshot.value.content || '（空白正文）' : '未提供正文快照' }}</p>
          <p v-if="Array.isArray(snapshot.value.tags) && snapshot.value.tags.length" class="snapshot-tags">{{ snapshot.value.tags.map(tag => `#${String(tag)}`).join('  ') }}</p>
          <p v-if="typeof snapshot.value.pinned === 'boolean'" class="snapshot-meta">{{ snapshot.value.pinned ? '已置顶' : '未置顶' }}</p>
        </section>
      </div>

      <details class="conflict-detail">
        <summary>查看同步详情</summary>
        <dl class="conflict-identifiers">
          <dt>操作</dt><dd>{{ item.operation_id }}</dd>
          <dt>笔记</dt><dd>{{ item.note_id }}</dd>
          <template v-if="item.localFilename"><dt>本地文件</dt><dd>{{ item.localFilename }}</dd></template>
        </dl>
        <pre v-if="item.detail.local_snapshot" aria-label="本地快照数据">{{ formatSnapshot(item.detail.local_snapshot) }}</pre>
        <pre v-if="item.detail.remote_snapshot" aria-label="远端快照数据">{{ formatSnapshot(item.detail.remote_snapshot) }}</pre>
      </details>

      <div v-if="actionErrors[item.id]" class="conflict-error" role="alert">{{ actionErrors[item.id] }}</div>
      <div v-if="pendingIds.has(item.id)" class="conflict-progress" role="status">正在处理…</div>
      <fieldset class="conflict-actions" :disabled="pendingIds.has(item.id)" aria-label="处理这条同步冲突">
          <button
            v-if="canKeepLocal(item)"
            type="button"
            class="conflict-action conflict-action-primary"
            @click="handleKeepLocal(item.id)"
          >
            保留本地并重试
          </button>
          <button
            v-if="canRecreateFromRemote(item)"
            type="button"
            class="conflict-action"
            @click="handleRecreateFromRemote(item.id)"
          >
            按远端重建
          </button>
          <button
            v-if="canAcceptRemoteDelete(item)"
            type="button"
            class="conflict-action"
            @click="handleAcceptRemoteDelete(item.id)"
          >
            接受远端删除
          </button>
          <button type="button" class="conflict-action" @click="handleAcceptResult(item.id)">接受当前结果</button>
          <button type="button" class="conflict-dismiss" @click="handleDismiss(item.id)">忽略</button>
      </fieldset>
    </article>
  </section>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import {
  canAcceptRemoteDeleteConflict,
  canKeepLocalConflict,
  canRecreateFromRemoteConflict,
  isRemoteDeleteConflict,
} from '../domain/sync/conflictResolution.js';
import {
  acceptRemoteDeleteConflict,
  acceptConflictResult,
  conflicts,
  dismissConflict,
  fetchConflicts,
  keepLocalAndResync,
  recreateFromRemoteConflict,
  type ConflictItem,
} from '../store/conflicts';
import { pushNotification } from '../store/notifications';

const viewRef = ref<HTMLElement | null>(null);
const headingRef = ref<HTMLElement | null>(null);
const isLoading = ref(false);
const loadError = ref('');
const pendingIds = ref(new Set<number>());
const actionErrors = ref<Record<number, string>>({});

async function loadConflicts() {
  if (isLoading.value) return;
  const retrying = Boolean(loadError.value);
  isLoading.value = true;
  loadError.value = '';
  try {
    await fetchConflicts();
  } catch {
    loadError.value = '冲突记录读取失败，请重试。';
  } finally {
    isLoading.value = false;
    if (retrying) {
      await nextTick();
      headingRef.value?.focus({ preventScroll: true });
    }
  }
}

function snapshotEntries(item: ConflictItem) {
  const entries: Array<{ label: string; value: Record<string, unknown> }> = [];
  for (const [label, raw] of [['本地版本', item.detail.local_snapshot], ['远端版本', item.detail.remote_snapshot]] as const) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) entries.push({ label, value: raw as Record<string, unknown> });
  }
  return entries;
}

function formatReason(item: ConflictItem) {
  if (item.reason === 'revision_conflict' && isRemoteDeleteConflict(item.detail)) return '远端删除与本地修改发生冲突';
  if (item.reason === 'revision_conflict') return '正文或标签发生并发修改';
  if (item.reason === 'local_note_not_found') return '本地未找到对应笔记';
  if (item.reason === 'unsupported_change_type') return '变更类型当前无法自动处理';
  return item.reason;
}

function canKeepLocal(item: ConflictItem) {
  return canKeepLocalConflict(item.reason);
}

function canRecreateFromRemote(item: ConflictItem) {
  return canRecreateFromRemoteConflict(item.reason);
}

function canAcceptRemoteDelete(item: ConflictItem) {
  return canAcceptRemoteDeleteConflict(item);
}

function formatSnapshot(value: unknown) {
  return JSON.stringify(value, null, 2);
}

async function runAction(id: number, action: (id: number) => Promise<void>, successMessage?: string) {
  if (pendingIds.value.has(id)) return;
  const index = conflicts.value.findIndex(item => item.id === id);
  const trigger = document.activeElement as HTMLElement | null;
  const row = viewRef.value?.querySelector(`[data-conflict-id="${id}"]`);
  const shouldRestoreFocus = () => viewRef.value?.isConnected && trigger && row?.contains(trigger)
    && (document.activeElement === document.body || document.activeElement === trigger);
  let failed = false;
  pendingIds.value.add(id);
  delete actionErrors.value[id];
  try {
    await action(id);
    if (successMessage) pushNotification(successMessage, 'success');
    await nextTick();
    if (shouldRestoreFocus()) {
      const next = conflicts.value[Math.min(index, conflicts.value.length - 1)];
      const nextButton = next && viewRef.value?.querySelector<HTMLButtonElement>(`[data-conflict-id="${next.id}"] button:not(:disabled)`);
      (nextButton || headingRef.value)?.focus({ preventScroll: true });
    }
  } catch (error) {
    failed = true;
    actionErrors.value[id] = error instanceof Error ? error.message : '处理失败，请重试。';
  } finally {
    pendingIds.value.delete(id);
    if (failed) {
      await nextTick();
      if (shouldRestoreFocus()) trigger?.focus({ preventScroll: true });
    }
  }
}

function handleKeepLocal(id: number) {
  return runAction(id, keepLocalAndResync, '已保留本地版本，并重新加入同步队列');
}

function handleAcceptResult(id: number) {
  return runAction(id, acceptConflictResult, '冲突已标记为已处理');
}

function handleRecreateFromRemote(id: number) {
  return runAction(id, recreateFromRemoteConflict, '已按远端内容重建笔记');
}

function handleAcceptRemoteDelete(id: number) {
  return runAction(id, acceptRemoteDeleteConflict, '已接受远端删除，本地笔记已移入回收站');
}

function handleDismiss(id: number) {
  return runAction(id, dismissConflict);
}

onMounted(() => {
  void loadConflicts();
});
</script>

<style scoped>
.conflict-view { display: flex; flex-direction: column; gap: 12px; }
.conflict-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;}
.conflict-header h3 { font-size: 1.15rem; font-weight: 600; color: var(--text-primary); }
.conflict-count { color: var(--text-secondary); font-size: var(--font-size-supporting); }
.conflict-empty { text-align: center; color: var(--text-secondary); padding: 40px; font-size: var(--font-size-supporting); background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border-color); }
.conflict-card {
  min-width: 0;
  background: var(--bg-card);
  border: 1px solid var(--warning-border);
  border-radius: var(--radius-lg);
  padding: 16px 18px;
}
.conflict-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 6px 12px; }
.conflict-reason { color: var(--warning-text); font-size: var(--font-size-supporting); }
.conflict-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; border: 0; min-width: 0; }
.conflict-meta, .conflict-tip { margin: 8px 0 0; color: var(--text-secondary); font-size: var(--font-size-supporting); overflow-wrap: anywhere; }
.conflict-tip { color: var(--warning-text); }
.conflict-comparison { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color); }
.conflict-version { min-width: 0; }
.conflict-version h4 { font-size: var(--font-size-supporting); font-weight: 600; }
.snapshot-content { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 240px; overflow-y: auto; scrollbar-width: thin; margin-top: 8px; font-size: var(--font-size-supporting); line-height: 1.7; }
.snapshot-tags { color: var(--accent-text); overflow-wrap: anywhere; margin-top: 8px; font-size: var(--font-size-small); }
.snapshot-state { color: var(--warning-text); font-size: var(--font-size-supporting); margin-top: 8px; }
.snapshot-meta { color: var(--text-secondary); font-size: var(--font-size-small); margin-top: 8px; }
.conflict-error { color: var(--danger-text); font-size: var(--font-size-supporting); overflow-wrap: anywhere; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
.conflict-progress { margin-top: 12px; color: var(--text-secondary); font-size: var(--font-size-small); }
.conflict-detail {
  margin-top: 12px;
  border-top: 1px solid var(--border-color);
  padding-top: 12px;
}
.conflict-detail summary {
  cursor: pointer;
  color: var(--text-secondary);
  font-size: var(--font-size-supporting);
  min-height: 32px;
  padding-block: 5px;
}
.conflict-identifiers { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 12px; margin-top: 10px; color: var(--text-secondary); font-size: var(--font-size-small); }
.conflict-identifiers dd { overflow-wrap: anywhere; }
.conflict-detail pre {
  margin: 10px 0 0;
  padding: 12px;
  border-radius: 10px;
  background: var(--surface-muted);
  color: var(--text-primary);
  font-size: var(--font-size-small);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.conflict-action,
.conflict-dismiss {
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  border-radius: var(--radius-md);
  min-height: 40px;
  padding: 8px 12px;
  font-size: var(--font-size-small);
  cursor: pointer;
  transition: background-color 0.15s;
}
.conflict-action:hover:not(:disabled), .conflict-dismiss:hover:not(:disabled) { background: var(--surface-hover); }
.conflict-action-primary {
  background: var(--accent-color);
  border-color: transparent;
  color: var(--accent-foreground);
}
.conflict-action-primary:hover:not(:disabled) { background: var(--accent-hover); }
.conflict-actions:disabled button { opacity: 0.55; cursor: wait; }
@container settings (max-width: 560px) {
  .conflict-comparison { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .conflict-version + .conflict-version { border-top: 1px solid var(--border-color); padding-top: 16px; }
  .conflict-card { padding: 16px; }
}
</style>
