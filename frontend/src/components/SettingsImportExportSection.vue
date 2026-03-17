<template>
  <section class="settings-section">
    <div class="section-header">
      <div>
        <h3>导入导出</h3>
        <p>把侧边栏里的备份与迁移操作集中到这里。</p>
      </div>
      <span v-if="isImporting" class="section-badge">处理中...</span>
    </div>

    <div class="card-grid two-up">
      <article class="settings-card">
        <h4>导出</h4>
        <p>导出完整备份或 Flomo CSV 导入文件。</p>
        <div class="button-row">
          <button type="button" class="primary-btn" @click="exportZip">导出 ZIP</button>
          <button type="button" class="secondary-btn" @click="exportFlomo">导出 Flomo CSV</button>
        </div>
      </article>

      <article class="settings-card">
        <h4>导入</h4>
        <p>从 Bemo 备份包或 Flomo ZIP 恢复笔记。</p>
        <div class="button-row">
          <button type="button" class="primary-btn" @click="triggerZipImport">导入 ZIP</button>
          <button type="button" class="secondary-btn" @click="triggerFlomoImport">导入 Flomo</button>
        </div>
      </article>
    </div>

    <article class="settings-card">
      <h4>维护</h4>
      <p>扫描 `images` 目录，删除已经没有任何笔记或回收站条目引用的孤儿图片。</p>
      <div class="button-row">
        <button type="button" class="secondary-btn" :disabled="isCleaningOrphans" @click="cleanupOrphanImages">
          {{ isCleaningOrphans ? '扫描中...' : '扫描并清理孤儿图片' }}
        </button>
      </div>
    </article>

    <input type="file" ref="zipFileInput" accept=".zip" hidden @change="handleZipImport" />
    <input type="file" ref="flomoFileInput" accept=".zip" hidden @change="handleFlomoImport" />
  </section>
</template>

<script setup lang="ts">
import { useImportExport } from '../composables/useImportExport';

const emit = defineEmits<{
  imported: [];
}>();

const {
  isImporting,
  isCleaningOrphans,
  flomoFileInput,
  zipFileInput,
  exportZip,
  exportFlomo,
  triggerZipImport,
  handleZipImport,
  triggerFlomoImport,
  handleFlomoImport,
  cleanupOrphanImages,
} = useImportExport(() => {
  emit('imported');
});

void flomoFileInput;
void zipFileInput;
</script>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-header,
.button-row {
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
.settings-card p {
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

.button-row {
  margin-top: 16px;
  justify-content: flex-start;
  flex-wrap: wrap;
}

.primary-btn,
.secondary-btn {
  border: none;
  border-radius: var(--radius-md, 0.5rem);
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 10px 14px;
  font-weight: 600;
}

.primary-btn {
  background: var(--accent-color, #31d279);
  color: #fff;
}

.secondary-btn {
  background: var(--bg-main, #f4f5f7);
  color: var(--text-primary, #18181b);
}

@media (max-width: 768px) {
  .card-grid.two-up {
    grid-template-columns: 1fr;
  }
}
</style>
