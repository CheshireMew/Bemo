<template>
  <div class="notification-stack" :class="stackClass" aria-live="polite" aria-atomic="true">
    <div
      v-for="item in notifications"
      :key="item.id"
      class="notification-item"
      :class="[`notification-${item.level}`]"
    >
      <span class="notification-message">{{ item.message }}</span>
      <div class="notification-actions">
        <button
          v-if="item.action"
          type="button"
          class="notification-action"
          @click="runNotificationAction(item)"
        >
          {{ item.action.label }}
        </button>
        <button type="button" class="notification-close" aria-label="关闭通知" @click="removeNotification(item.id)"><X :size="16" /></button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { X } from 'lucide-vue-next';
import { notifications, removeNotification, runNotificationAction } from '../../store/notifications';

const props = withDefaults(defineProps<{
  shell?: 'web-desktop' | 'mobile';
}>(), {
  shell: 'web-desktop',
});

const stackClass = computed(() => (
  props.shell === 'mobile'
    ? 'notification-stack-mobile'
    : 'notification-stack-web-desktop'
));
</script>

<style scoped>
.notification-stack {
  position: fixed;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notification-stack-web-desktop {
  top: 16px;
  right: 16px;
  width: min(360px, calc(100vw - 24px));
}

.notification-stack-mobile {
  top: calc(12px + var(--safe-top));
  right: 12px;
  left: 12px;
  width: auto;
}

.notification-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--border-color, #d4d4d8);
  background: var(--bg-card, #fff);
  color: var(--text-primary, #18181b);
  box-shadow: 0 10px 24px rgba(24, 24, 27, 0.12);
}

.notification-message {
  min-width: 0;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.notification-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.notification-action {
  border: 1px solid currentColor;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  padding: 5px 9px;
  font: inherit;
  font-size: var(--font-size-small);
  font-weight: 600;
  cursor: pointer;
}

.notification-success {
  border-color: color-mix(in srgb, var(--accent-color) 45%, var(--border-color));
}

.notification-error {
  border-color: color-mix(in srgb, var(--danger-color) 42%, var(--border-color));
  background: color-mix(in srgb, var(--danger-color) 12%, var(--bg-card));
  color: var(--danger-text);
}

.notification-info {
  border-color: color-mix(in srgb, var(--info-color) 38%, var(--border-color));
  background: color-mix(in srgb, var(--info-color) 10%, var(--bg-card));
  color: var(--info-text);
}

.notification-close {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  display: grid;
  place-items: center;
  min-width: 32px;
  min-height: 32px;
  border-radius: var(--radius-sm);
}
.notification-close:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
@media (pointer: coarse) { .notification-close, .notification-action { min-width: 44px; min-height: 44px; } }
</style>
