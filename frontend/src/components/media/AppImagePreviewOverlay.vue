<template>
  <teleport to="body">
    <div v-if="isImagePreviewOpen && currentItem" class="preview-overlay" @click.self="closeImagePreview">
      <section ref="panelRef" v-modal-focus="closeImagePreview" class="preview-panel" role="dialog" aria-modal="true" aria-label="图片预览" @keydown.left.prevent="showPreviousPreviewImage" @keydown.right.prevent="showNextPreviewImage">
        <header class="preview-header">
          <div class="preview-meta">
            <h2>{{ currentItem.label || '图片预览' }}</h2>
            <p v-if="imagePreviewItems.length > 1" aria-live="polite">{{ imagePreviewIndex + 1 }} / {{ imagePreviewItems.length }}</p>
          </div>
          <button type="button" class="close-btn" @click="closeImagePreview">关闭</button>
        </header>

        <div class="preview-stage" :aria-busy="imageStatus === 'loading'">
          <div v-if="imageStatus !== 'loaded'" class="preview-status" :role="imageStatus === 'error' ? 'alert' : 'status'">
            <ImageOff v-if="imageStatus === 'error'" :size="32" aria-hidden="true" />
            <ImageIcon v-else :size="32" aria-hidden="true" />
            <p>{{ imageStatus === 'error' ? '图片未能加载' : '正在加载图片…' }}</p>
            <button v-if="imageStatus === 'error'" type="button" class="retry-btn" @click="retryImage">重新加载</button>
          </div>
          <button
            v-if="imagePreviewItems.length > 1"
            type="button"
            class="nav-btn nav-btn-prev"
            aria-label="上一张"
            @click="showPreviousPreviewImage"
          >
            <ChevronLeft :size="24" aria-hidden="true" />
          </button>

          <img :key="`${imagePreviewIndex}-${retryKey}-${currentItem.url}`" v-show="imageStatus === 'loaded'" :src="currentItem.url" :alt="currentItem.label || '笔记图片'" class="preview-image" @load="imageStatus = 'loaded'" @error="imageStatus = 'error'" />

          <button
            v-if="imagePreviewItems.length > 1"
            type="button"
            class="nav-btn nav-btn-next"
            aria-label="下一张"
            @click="showNextPreviewImage"
          >
            <ChevronRight :size="24" aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, Image as ImageIcon, ImageOff } from 'lucide-vue-next';
import { vModalFocus } from '../../directives/modalFocus';
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
const imageStatus = ref<'loading' | 'loaded' | 'error'>('loading');
const retryKey = ref(0);
const panelRef = ref<HTMLElement | null>(null);
watch(currentItem, () => {
  imageStatus.value = 'loading';
  retryKey.value = 0;
});

const retryImage = async () => {
  imageStatus.value = 'loading';
  retryKey.value++;
  await nextTick();
  panelRef.value?.querySelector<HTMLButtonElement>('.close-btn')?.focus({ preventScroll: true });
};

useScrollLock(isImagePreviewOpen);
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
  background: rgb(12 15 20 / 96%);
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
  font-size: var(--font-size-small);
  color: rgba(255, 255, 255, 0.72);
}

.close-btn,
.nav-btn,
.retry-btn {
  border: 1px solid rgb(255 255 255 / 28%);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.14);
  color: white;
  cursor: pointer;
  transition: background-color 0.15s;
}

.close-btn:hover,
.nav-btn:hover,
.retry-btn:hover {
  background: rgb(255 255 255 / 24%);
}

.preview-panel :focus-visible {
  outline-color: white;
}

.close-btn {
  padding: 10px 14px;
  min-height: 44px;
  flex-shrink: 0;
  font: inherit;
}

.preview-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: min(480px, calc(100dvh - 160px));
  flex: 1;
}

.preview-status {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 24px 52px;
  color: #fff;
  text-align: center;
  font-size: var(--font-size-supporting);
}

.retry-btn { min-height: 44px; padding: 8px 16px; font: inherit; }

.preview-image {
  display: block;
  max-width: 100%;
  max-height: calc(100dvh - 160px);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.08);
  object-fit: contain;
}

.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  background: #282e37;
}

.nav-btn:hover { background: #3b4552; }
.nav-btn:focus-visible { outline-offset: -5px; }

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
    max-height: calc(100dvh - 160px);
  }

  .nav-btn-prev {
    left: 4px;
  }

  .nav-btn-next {
    right: 4px;
  }
}
</style>
