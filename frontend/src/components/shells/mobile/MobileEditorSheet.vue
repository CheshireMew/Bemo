<template>
  <teleport to="body">
    <div v-if="open" class="sheet-overlay" :style="overlayStyle" @click.self="emit('close')">
      <section class="sheet-panel" :style="panelStyle" role="dialog" aria-modal="true" :aria-label="title">
        <header class="sheet-header">
          <div class="sheet-handle" aria-hidden="true"></div>
          <div class="sheet-heading">
            <h2>{{ title }}</h2>
            <p>{{ subtitle }}</p>
          </div>
          <button type="button" class="close-btn" @click="emit('close')">关闭</button>
        </header>

        <div class="sheet-body">
          <MobileEditor
            ref="editorRef"
            :draft-key="draftKey"
            :initial-content="initialContent"
            :initial-tags="initialTags"
            :show-cancel="showCancel"
            :autosave-draft="autosaveDraft"
            :reset-on-success="resetOnSuccess"
            :placeholder="placeholder"
            :submit-title="submitTitle"
            :submit-action="submitAction"
            @cancel="emit('close')"
            @saved="emit('saved')"
          />
        </div>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MobileEditor from '../../editor/MobileEditor.vue';
import type { EditorSubmitPayload } from '../../Editor.vue';
import { mobileKeyboardInset } from '../../../domain/runtime/mobileKeyboardInsets.js';
import { isAndroidNativePlatform } from '../../../domain/runtime/platformCapabilities.js';
import { useScrollLock } from '../../../composables/useScrollLock';

// On Android, the native side now consumes IME insets so the WebView does
// NOT shrink when the keyboard opens. JS handles compensation exclusively
// via mobileKeyboardInset. We use a platform flag to skip viewport-based
// calculations that would be redundant / conflicting.
const isAndroidNative = isAndroidNativePlatform();

const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  subtitle: string;
  draftKey?: string;
  initialContent?: string;
  initialTags?: string[];
  placeholder?: string;
  showCancel?: boolean;
  autosaveDraft?: boolean;
  resetOnSuccess?: boolean;
  submitTitle?: string;
  submitAction?: ((payload: EditorSubmitPayload) => Promise<void> | void) | null;
}>(), {
  draftKey: 'compose-mobile',
  initialContent: '',
  initialTags: () => [],
  placeholder: '现在的想法是...',
  showCancel: true,
  autosaveDraft: true,
  resetOnSuccess: true,
  submitTitle: '保存',
  submitAction: null,
});

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const editorRef = ref<{ focusEditor?: () => void } | null>(null);
const viewportKeyboardInset = ref(0);
const viewportHeight = ref<number | null>(null);
const viewportOffsetTop = ref(0);
const baselineViewportHeight = ref(0);

const effectiveViewportHeight = computed(() => (
  viewportHeight.value ?? baselineViewportHeight.value ?? null
));

const unaccountedKeyboardInset = computed(() => Math.max(
  0,
  mobileKeyboardInset.value - viewportKeyboardInset.value,
));

useScrollLock(computed(() => props.open));

const focusEditor = async () => {
  await nextTick();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      editorRef.value?.focusEditor?.();
    });
  });
};

const updateViewportMetrics = () => {
  if (typeof window === 'undefined') {
    viewportKeyboardInset.value = 0;
    viewportHeight.value = null;
    viewportOffsetTop.value = 0;
    baselineViewportHeight.value = 0;
    return;
  }

  const currentInnerHeight = Math.round(window.innerHeight);
  if (currentInnerHeight > baselineViewportHeight.value) {
    baselineViewportHeight.value = currentInnerHeight;
  }

  const visualViewport = window.visualViewport;
  const currentViewportOffsetTop = visualViewport
    ? Math.max(0, Math.round(visualViewport.offsetTop))
    : 0;
  // In adjustResize mode, window.innerHeight shrinks with the keyboard but
  // visualViewport.height may still report the full CSS viewport height.
  // Take the smaller value so the overlay never exceeds the usable area.
  const currentViewportHeight = visualViewport
    ? Math.min(currentInnerHeight, Math.round(visualViewport.height))
    : currentInnerHeight;
  const visualViewportInset = visualViewport
    ? Math.max(0, Math.round(currentInnerHeight - visualViewport.height - visualViewport.offsetTop))
    : 0;
  const baselineInset = Math.max(0, baselineViewportHeight.value - currentViewportHeight);

  viewportHeight.value = currentViewportHeight;
  viewportOffsetTop.value = currentViewportOffsetTop;
  viewportKeyboardInset.value = Math.max(visualViewportInset, baselineInset);
};

const overlayStyle = computed(() => {
  const style: Record<string, string> = {
    paddingTop: 'calc(var(--safe-top) + 12px)',
    paddingBottom: 'calc(var(--safe-bottom) + 12px)',
  };

  if (isAndroidNative) {
    // Android: WebView stays full-size (IME insets consumed on native side).
    // Use mobileKeyboardInset directly for bottom padding to push the panel
    // above the keyboard. No viewport height tricks needed.
    if (mobileKeyboardInset.value > 0) {
      style.paddingBottom = `${mobileKeyboardInset.value + 12}px`;
    }
    return style;
  }

  // Non-adjustResize environments (iOS, desktop): set explicit height
  // from visualViewport and compensate for unaccounted keyboard inset.
  const currentViewportHeight = effectiveViewportHeight.value;

  if (currentViewportHeight) {
    style.height = `${currentViewportHeight}px`;
  }

  if (viewportOffsetTop.value > 0) {
    style.top = `${viewportOffsetTop.value}px`;
  }

  if (unaccountedKeyboardInset.value > 0) {
    style.paddingBottom = `calc(var(--safe-bottom) + ${unaccountedKeyboardInset.value + 12}px)`;
  }

  return style;
});

const panelStyle = computed(() => {
  if (isAndroidNative) {
    // Android: overlay is full-screen with keyboard padding, panel just
    // needs to fill the remaining space.
    return {};
  }

  const currentViewportHeight = effectiveViewportHeight.value;
  if (!currentViewportHeight) {
    return {};
  }

  const maxHeight = Math.max(200, currentViewportHeight - unaccountedKeyboardInset.value - 24);
  const style: Record<string, string> = {
    maxHeight: `${maxHeight}px`,
  };

  if (mobileKeyboardInset.value > 0 || viewportKeyboardInset.value > 0) {
    style.minHeight = `${Math.min(220, maxHeight)}px`;
  }

  return style;
});

watch(() => props.open, (open) => {
  if (!open) {
    baselineViewportHeight.value = 0;
    viewportKeyboardInset.value = 0;
    viewportHeight.value = null;
    viewportOffsetTop.value = 0;
    return;
  }
  updateViewportMetrics();
  void focusEditor();
});

onMounted(() => {
  updateViewportMetrics();

  if (typeof window === 'undefined') return;

  const visualViewport = window.visualViewport;
  window.addEventListener('resize', updateViewportMetrics, { passive: true });
  visualViewport?.addEventListener('resize', updateViewportMetrics);
  visualViewport?.addEventListener('scroll', updateViewportMetrics);
});

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return;

  const visualViewport = window.visualViewport;
  window.removeEventListener('resize', updateViewportMetrics);
  visualViewport?.removeEventListener('resize', updateViewportMetrics);
  visualViewport?.removeEventListener('scroll', updateViewportMetrics);
});
</script>

<style scoped>
.sheet-overlay {
  position: fixed;
  top: 0;
  bottom: 0;
  right: 0;
  left: 0;
  z-index: 431;
  background: color-mix(in srgb, var(--bg-main) 76%, rgba(15, 23, 42, 0.34));
  backdrop-filter: blur(18px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  transition: padding-bottom 0.18s ease, padding-top 0.18s ease;
}

.sheet-panel {
  width: min(100vw, 720px);
  min-height: 280px;
  display: flex;
  flex-direction: column;
  background: var(--bg-main);
  border-radius: 28px 28px 0 0;
  box-shadow: 0 -18px 48px rgba(15, 23, 42, 0.16);
  overflow: hidden;
}

.sheet-header {
  position: relative;
  padding: 10px 16px 12px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  border-bottom: 1px solid var(--border-color, #e4e4e7);
  background: color-mix(in srgb, var(--bg-main) 96%, transparent);
  backdrop-filter: blur(16px);
}

.sheet-handle {
  width: 42px;
  height: 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border-color, #e4e4e7) 80%, var(--text-secondary, #71717a));
  align-self: center;
}

.sheet-heading {
  min-width: 0;
  padding-right: 70px;
}

.sheet-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1rem;
}

.sheet-header p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 0.82rem;
  line-height: 1.5;
}

.close-btn {
  position: absolute;
  top: 18px;
  right: 16px;
  border: 1px solid var(--border-color, #e4e4e7);
  background: color-mix(in srgb, var(--bg-card, white) 90%, transparent);
  color: var(--text-primary);
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
}

.sheet-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: 0 0 calc(8px + var(--safe-bottom));
}

.sheet-body :deep(.editor-card) {
  flex: none;
  min-height: auto;
  border: none;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}

.sheet-body :deep(.editor-body) {
  flex: none;
  min-height: auto;
  overflow: visible;
}

.sheet-body :deep(.editor-preview),
.sheet-body :deep(.editor-input) {
  min-height: 180px;
}

@media (max-width: 767px) {
  .sheet-panel {
    width: 100vw;
    border-radius: 24px 24px 0 0;
  }
}
</style>
