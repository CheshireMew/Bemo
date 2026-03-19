<template>
  <teleport to="body">
    <div v-if="open" class="migration-overlay">
      <section class="migration-modal" role="dialog" aria-modal="true" aria-label="旧库迁移">
        <header class="migration-header">
          <div>
            <h2>迁移旧 Markdown 笔记库</h2>
            <p>检测到旧版 Markdown 笔记目录。建议现在一次性迁移到本机数据库，后续前端将直接使用本地数据库作为运行时真相源。</p>
          </div>
        </header>

        <div class="migration-body">
          <div class="migration-stats">
            <div class="stat-card">
              <strong>{{ preview.noteCount }}</strong>
              <span>活动笔记</span>
            </div>
            <div class="stat-card">
              <strong>{{ preview.trashCount }}</strong>
              <span>回收站条目</span>
            </div>
            <div class="stat-card">
              <strong>{{ preview.attachmentCount }}</strong>
              <span>引用附件</span>
            </div>
          </div>

          <p class="migration-hint">迁移会导入笔记、回收站和旧 `images` 附件，并重置本机同步状态；不会把这批数据当成新的远端创建重放。</p>
        </div>

        <footer class="migration-actions">
          <button type="button" class="secondary-btn" :disabled="loading" @click="$emit('close')">稍后处理</button>
          <button type="button" class="primary-btn" :disabled="loading" @click="$emit('confirm')">
            {{ loading ? '迁移中...' : '开始迁移' }}
          </button>
        </footer>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import type { LegacyMigrationPreview } from '../domain/notes/legacyMigration.js';

defineProps<{
  open: boolean;
  loading: boolean;
  preview: LegacyMigrationPreview;
}>();

defineEmits<{
  close: [];
  confirm: [];
}>();
</script>

<style scoped>
.migration-overlay {
  position: fixed;
  inset: 0;
  z-index: 2200;
  background: color-mix(in srgb, var(--bg-main) 88%, rgba(15, 23, 42, 0.24));
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.migration-modal {
  width: min(720px, 100%);
  background: var(--bg-main, #f6f7fb);
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: 18px;
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.16);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.migration-header h2 {
  margin: 0;
  color: var(--text-primary, #18181b);
}

.migration-header p,
.migration-hint {
  margin: 8px 0 0;
  color: var(--text-secondary, #71717a);
  line-height: 1.6;
}

.migration-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.stat-card {
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: 14px;
  padding: 16px;
  background: var(--bg-card, #fff);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-card strong {
  font-size: 1.4rem;
  color: var(--text-primary, #18181b);
}

.stat-card span {
  color: var(--text-secondary, #71717a);
  font-size: 0.92rem;
}

.migration-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.primary-btn,
.secondary-btn {
  border: none;
  border-radius: 10px;
  cursor: pointer;
  padding: 10px 14px;
  font-weight: 600;
}

.primary-btn {
  background: var(--accent-color, #31d279);
  color: #fff;
}

.secondary-btn {
  background: var(--bg-card, #fff);
  color: var(--text-primary, #18181b);
}

@media (max-width: 767px) {
  .migration-overlay {
    padding: 12px;
  }

  .migration-modal {
    padding: 18px;
  }

  .migration-stats {
    grid-template-columns: 1fr;
  }

  .migration-actions {
    flex-direction: column-reverse;
  }
}
</style>
