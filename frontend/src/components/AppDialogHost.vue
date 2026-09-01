<template>
  <teleport to="body">
    <div v-if="activeDialog" class="dialog-overlay" @click.self="cancelDialog">
      <section
        :key="activeDialog.id"
        v-modal-focus="cancelDialog"
        class="app-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="descriptionId"
        @keydown.enter="handleEnter"
      >
        <h2 :id="titleId">{{ activeDialog.title }}</h2>
        <p :id="descriptionId">{{ activeDialog.message }}</p>

        <label v-if="activeDialog.mode === 'prompt'" class="dialog-input-row">
          <span>{{ activeDialog.inputLabel || '输入内容' }}</span>
          <input
            ref="inputRef"
            v-model="inputValue"
            type="url"
            :placeholder="activeDialog.inputPlaceholder"
            :aria-invalid="Boolean(validationError)"
            :aria-describedby="validationError ? 'dialog-input-error' : undefined"
          />
          <span v-if="validationError" id="dialog-input-error" class="validation-error" role="alert">{{ validationError }}</span>
        </label>

        <div class="dialog-actions">
          <button type="button" class="dialog-cancel" @click="cancelDialog">
            {{ activeDialog.cancelLabel }}
          </button>
          <button
            type="button"
            class="dialog-confirm"
            :class="{ danger: activeDialog.danger }"
            :disabled="activeDialog.mode === 'prompt' && !inputValue.trim()"
            @click="confirmDialog"
          >
            {{ activeDialog.confirmLabel }}
          </button>
        </div>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { vModalFocus } from '../directives/modalFocus';
import { activeDialog, resolveDialog } from '../store/dialogs';
import { useScrollLock } from '../composables/useScrollLock';

const inputRef = ref<HTMLInputElement | null>(null);
const inputValue = ref('');
const validationError = ref('');
useScrollLock(computed(() => Boolean(activeDialog.value)));
const titleId = computed(() => `app-dialog-title-${activeDialog.value?.id || 0}`);
const descriptionId = computed(() => `app-dialog-description-${activeDialog.value?.id || 0}`);

watch(activeDialog, async (dialog) => {
  inputValue.value = dialog?.inputValue || '';
  validationError.value = '';
  if (dialog?.mode !== 'prompt') return;
  await nextTick();
  inputRef.value?.focus();
  inputRef.value?.select();
});

const cancelDialog = () => {
  resolveDialog(activeDialog.value?.mode === 'prompt' ? null : false);
};

const confirmDialog = () => {
  if (!activeDialog.value) return;
  if (activeDialog.value.mode === 'prompt') {
    const value = inputValue.value.trim();
    if (!value) return;
    validationError.value = activeDialog.value.validate?.(value) || '';
    if (validationError.value) return;
    resolveDialog(value);
    return;
  }
  resolveDialog(true);
};

const handleEnter = (event: KeyboardEvent) => {
  if (event.isComposing || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target !== inputRef.value) return;
  event.preventDefault();
  confirmDialog();
};
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 2600;
  display: grid;
  place-items: center;
  padding: 20px max(20px, var(--safe-right)) max(20px, var(--safe-bottom)) max(20px, var(--safe-left));
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(10px);
}

.app-dialog {
  width: min(440px, 100%);
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 18px;
  background: var(--bg-card);
  color: var(--text-primary);
  padding: 22px;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.22);
}

.app-dialog h2 {
  margin: 0;
  font-size: 1.08rem;
}

.app-dialog p {
  margin: 10px 0 0;
  color: var(--text-secondary);
  font-size: var(--font-size-supporting);
  line-height: 1.65;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.validation-error { color: var(--danger-text); font-weight: var(--font-weight-readable); }

.dialog-input-row {
  display: grid;
  gap: 8px;
  margin-top: 18px;
  color: var(--text-primary);
  font-size: var(--font-size-small);
  font-weight: 600;
}

.dialog-input-row input {
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-main);
  color: var(--text-primary);
  padding: 10px 12px;
  font: inherit;
}

.dialog-input-row input:focus {
  outline: 2px solid color-mix(in srgb, var(--accent-color) 28%, transparent);
  border-color: var(--accent-color);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}

.dialog-actions button {
  min-width: 82px;
  min-height: 40px;
  border: none;
  border-radius: 10px;
  padding: 9px 14px;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}

.dialog-cancel {
  background: var(--bg-main);
  color: var(--text-primary);
}

.dialog-confirm {
  background: var(--accent-color);
  color: var(--accent-foreground);
}

.dialog-confirm.danger {
  background: var(--danger-button-bg);
  color: #fff;
}

.dialog-confirm:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
