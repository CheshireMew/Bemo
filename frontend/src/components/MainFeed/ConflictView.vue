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
        <button class="conflict-dismiss" @click="dismissConflict(item.id)">忽略</button>
      </div>
      <p class="conflict-meta">原因：{{ formatReason(item.reason) }}</p>
      <p class="conflict-meta">操作：{{ item.operation_id }}</p>
      <p class="conflict-meta">笔记：{{ item.note_id }}</p>
      <p v-if="item.detail.conflict_copy_filename" class="conflict-tip">
        已生成冲突副本：{{ String(item.detail.conflict_copy_filename) }}
      </p>
    </article>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { conflicts, dismissConflict, fetchConflicts } from '../../store/conflicts';

function formatReason(reason: string) {
  if (reason === 'revision_conflict') return '正文发生并发修改';
  if (reason === 'local_note_not_found') return '本地未找到对应笔记';
  return reason;
}

onMounted(() => {
  void fetchConflicts();
});
</script>

<style scoped>
.conflict-view { margin-top: 24px; display: flex; flex-direction: column; gap: 12px; }
.conflict-header { display: flex; justify-content: space-between; align-items: center; }
.conflict-header h3 { font-size: 1.1rem; font-weight: 600; color: var(--text-primary); }
.conflict-count { color: var(--text-secondary); font-size: 0.85rem; }
.conflict-empty { text-align: center; color: #ccc; padding: 40px; font-size: 0.9rem; }
.conflict-card {
  background: var(--bg-card);
  border: 1px solid #f5c16c;
  border-radius: var(--radius-lg);
  padding: 16px 18px;
}
.conflict-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.conflict-meta, .conflict-tip { margin: 8px 0 0; color: var(--text-secondary); font-size: 0.9rem; }
.conflict-tip { color: #b45309; }
.conflict-dismiss {
  border: none;
  background: #fff7ed;
  color: #b45309;
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
}
</style>
