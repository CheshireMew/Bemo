<template>
  <div class="conflict-view">
    <div class="conflict-header">
      <h3>冲突记录</h3>
      <span class="conflict-count" v-if="conflicts.length">{{ conflicts.length }} 条</span>
    </div>
    <div v-if="conflicts.length === 0" class="conflict-empty">当前没有未处理的同步冲突。</div>

    <article v-for="item in conflicts" :key="item.id" class="conflict-card">
      <div class="conflict-row">
        <strong>{{ item.source === 'server' ? '服务器同步' : 'WebDAV 同步' }}</strong>
        <div class="conflict-actions">
          <button
            v-if="canKeepLocal(item)"
            class="conflict-action conflict-action-primary"
            @click="handleKeepLocal(item.id)"
          >
            保留本地并重试
          </button>
          <button
            v-if="canRecreateFromRemote(item)"
            class="conflict-action"
            @click="handleRecreateFromRemote(item.id)"
          >
            按远端重建
          </button>
          <button
            v-if="canAcceptRemoteDelete(item)"
            class="conflict-action"
            @click="handleAcceptRemoteDelete(item.id)"
          >
            接受远端删除
          </button>
          <button class="conflict-action" @click="handleAcceptResult(item.id)">接受当前结果</button>
          <button class="conflict-dismiss" @click="dismissConflict(item.id)">忽略</button>
        </div>
      </div>
      <p class="conflict-meta">原因：{{ formatReason(item) }}</p>
      <p class="conflict-meta">操作：{{ item.operation_id }}</p>
      <p class="conflict-meta">笔记：{{ item.note_id }}</p>
      <p v-if="item.actionLabel" class="conflict-meta">建议：{{ item.actionLabel }}</p>
      <p v-if="item.localFilename" class="conflict-meta">本地文件：{{ item.localFilename }}</p>
      <p v-if="item.detail.conflict_copy_filename" class="conflict-tip">
        已生成冲突副本：{{ String(item.detail.conflict_copy_filename) }}
      </p>
      <details v-if="item.detail.local_snapshot || item.detail.remote_snapshot" class="conflict-detail">
        <summary>查看冲突详情</summary>
        <pre v-if="item.detail.local_snapshot">{{ formatSnapshot(item.detail.local_snapshot) }}</pre>
        <pre v-if="item.detail.remote_snapshot">{{ formatSnapshot(item.detail.remote_snapshot) }}</pre>
      </details>
    </article>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
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

async function handleKeepLocal(id: number) {
  try {
    await keepLocalAndResync(id);
    pushNotification('已保留本地版本，并重新加入同步队列', 'success');
  } catch (error) {
    pushNotification(error instanceof Error ? error.message : '处理冲突失败', 'error');
  }
}

async function handleAcceptResult(id: number) {
  await acceptConflictResult(id);
  pushNotification('冲突已标记为已处理', 'success');
}

async function handleRecreateFromRemote(id: number) {
  try {
    await recreateFromRemoteConflict(id);
    pushNotification('已按远端内容重建笔记', 'success');
  } catch (error) {
    pushNotification(error instanceof Error ? error.message : '按远端重建失败', 'error');
  }
}

async function handleAcceptRemoteDelete(id: number) {
  try {
    await acceptRemoteDeleteConflict(id);
    pushNotification('已接受远端删除，本地笔记已移入回收站', 'success');
  } catch (error) {
    pushNotification(error instanceof Error ? error.message : '接受远端删除失败', 'error');
  }
}

onMounted(() => {
  void fetchConflicts();
});
</script>

<style scoped>
.conflict-view { display: flex; flex-direction: column; gap: 12px; }
.conflict-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;}
.conflict-header h3 { font-size: 1.15rem; font-weight: 600; color: var(--text-primary); }
.conflict-header p { color: var(--text-secondary); font-size: 0.9rem; margin-top: 4px; }
.conflict-empty { text-align: center; color: var(--text-secondary); padding: 40px; font-size: 0.9rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border-color); }
.conflict-card {
  background: var(--bg-card);
  border: 1px solid #f5c16c;
  border-radius: var(--radius-lg);
  padding: 16px 18px;
}
.conflict-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.conflict-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.conflict-meta, .conflict-tip { margin: 8px 0 0; color: var(--text-secondary); font-size: 0.9rem; }
.conflict-tip { color: #b45309; }
.conflict-detail {
  margin-top: 12px;
  border-top: 1px dashed color-mix(in srgb, #f5c16c 45%, transparent);
  padding-top: 12px;
}
.conflict-detail summary {
  cursor: pointer;
  color: #92400e;
  font-size: 0.9rem;
}
.conflict-detail pre {
  margin: 10px 0 0;
  padding: 12px;
  border-radius: 10px;
  background: #fffaf0;
  color: #6b7280;
  font-size: 0.83rem;
  white-space: pre-wrap;
  word-break: break-word;
}
.conflict-action,
.conflict-dismiss {
  border: none;
  background: #fff7ed;
  color: #b45309;
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
}
.conflict-action-primary {
  background: #b45309;
  color: #fff;
}
</style>
