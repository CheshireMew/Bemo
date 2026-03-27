<template>
  <teleport to="body">
    <div v-if="isImagePreviewOpen && currentItem" class="preview-overlay" @click.self="closeImagePreview">
      <section class="preview-panel" role="dialog" aria-modal="true" aria-label="图片预览">
        <header class="preview-header">
          <div class="preview-meta">
            <h2>{{ currentItem.label || '图片预览' }}</h2>
            <p v-if="imagePreviewItems.length > 1">{{ imagePreviewIndex + 1 }} / {{ imagePreviewItems.length }}</p>
          </div>
          <button type="button" class="close-btn" @click="closeImagePreview">关闭</button>
        </header>

        <div class="preview-stage">
          <button
            v-if="imagePreviewItems.length > 1"
            type="button"
            class="nav-btn nav-btn-prev"
            aria-label="上一张"
            @click="showPreviousPreviewImage"
          >
            ‹
          </button>

          <img :src="currentItem.url" :alt="currentItem.label" class="preview-image" />

          <button
            v-if="imagePreviewItems.length > 1"
            type="button"
            class="nav-btn nav-btn-next"
            aria-label="下一张"
            @click="showNextPreviewImage"
          >
            ›
          </button>
        </div>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import {
  closeImagePreview,
  imagePreviewIndex,
  imagePreviewItems,
  isImagePreviewOpen,
  showNextPreviewImage,
  showPreviousPreviewImage,
} from '../../store/ui';
import { useScrollLock } from '../../composables/useScrollLock';

const currentItem = computed(() => imagePreviewItems.value[imagePreviewIndex.value] || null);

useScrollLock(isImagePreviewOpen);

const handleKeydown = (event: KeyboardEvent) => {
  if (!isImagePreviewOpen.value) return;
  if (event.key === 'Escape') {
    closeImagePreview();
    return;
  }
  if (event.key === 'ArrowLeft') {
    showPreviousPreviewImage();
    return;
  }
  if (event.key === 'ArrowRight') {
    showNextPreviewImage();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<style scoped>
.preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 418;
  display: flex;
  align-items: center;
  justify-content: center;
  padding:
    calc(16px + var(--safe-top))
    max(16px, var(--safe-right))
    calc(16px + var(--safe-bottom))
    max(16px, var(--safe-left));
  background: rgba(15, 23, 42, 0.58);
  backdrop-filter: blur(20px);
}

.preview-panel {
  width: min(100%, 960px);
  max-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: white;
}

.preview-meta {
  min-width: 0;
}

.preview-meta h2 {
  margin: 0;
  font-size: 1rem;
  line-height: 1.4;
  word-break: break-word;
}

.preview-meta p {
  margin: 4px 0 0;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.72);
}

.close-btn,
.nav-btn {
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: white;
  cursor: pointer;
  backdrop-filter: blur(12px);
}

.close-btn {
  padding: 10px 14px;
  font: inherit;
}

.preview-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  flex: 1;
}

.preview-image {
  display: block;
  max-width: 100%;
  max-height: min(78vh, calc(100dvh - 140px));
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
  object-fit: contain;
}

.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 44px;
  font-size: 1.75rem;
  line-height: 1;
}

.nav-btn-prev {
  left: 12px;
}

.nav-btn-next {
  right: 12px;
}

@media (max-width: 767px) {
  .preview-overlay {
    padding:
      calc(10px + var(--safe-top))
      max(10px, var(--safe-right))
      calc(10px + var(--safe-bottom))
      max(10px, var(--safe-left));
  }

  .preview-panel {
    gap: 12px;
  }

  .preview-image {
    max-height: min(72vh, calc(100dvh - 120px));
    border-radius: 16px;
  }

  .nav-btn {
    width: 38px;
    height: 38px;
    font-size: 1.5rem;
  }

  .nav-btn-prev {
    left: 4px;
  }

  .nav-btn-next {
    right: 4px;
  }
}
</style>
