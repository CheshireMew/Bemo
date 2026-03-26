<template>
  <section class="settings-section">
    <div class="section-header">
      <div>
        <h3>附件</h3>
        <p>查看当前数据源的附件状态，并清理没有任何引用关系的文件。</p>
      </div>
    </div>

    <div class="card-grid three-up">
      <article class="settings-card">
        <h4>已存附件</h4>
        <p class="stat-value">{{ attachmentSummary.storedAttachments }}</p>
        <p>当前主存储里的正式附件总数。</p>
      </article>

      <article class="settings-card">
        <h4>被引用附件</h4>
        <p class="stat-value">{{ attachmentSummary.totalReferencedAttachments }}</p>
        <p>被笔记、回收站或草稿引用的唯一附件数。</p>
      </article>

      <article class="settings-card">
        <h4>未引用附件</h4>
        <p class="stat-value">{{ attachmentSummary.unreferencedStoredAttachments }}</p>
        <p>当前可被清理的未引用正式附件数。</p>
      </article>
    </div>

    <article class="settings-card">
      <h4>引用分布</h4>
      <p>笔记 {{ attachmentSummary.activeAttachments }} 个，回收站 {{ attachmentSummary.trashAttachments }} 个，草稿 {{ attachmentSummary.draftAttachments }} 个，草稿附件区暂存 {{ attachmentSummary.storedDraftAttachments }} 个文件。</p>
      <div class="button-row">
        <button type="button" class="secondary-btn" :disabled="isCleaningOrphans" @click="cleanupOrphanImages">
          {{ isCleaningOrphans ? '清理中...' : '清理未引用附件' }}
        </button>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { useImportExport } from '../composables/useImportExport';

const {
  attachmentSummary,
  isCleaningOrphans,
  cleanupOrphanImages,
} = useImportExport();
</script>

<style scoped>
.stat-value {
  margin-top: 14px;
  font-size: 2rem;
  font-weight: 700;
  line-height: 1;
  color: var(--text-primary, #18181b);
}
</style>
