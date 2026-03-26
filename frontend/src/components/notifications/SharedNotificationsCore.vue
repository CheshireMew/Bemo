<template>
  <div class="notification-stack" :class="stackClass" aria-live="polite" aria-atomic="true">
    <div
      v-for="item in notifications"
      :key="item.id"
      class="notification-item"
      :class="[`notification-${item.level}`]"
    >
      <span>{{ item.message }}</span>
      <button type="button" class="notification-close" @click="removeNotification(item.id)">×</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { notifications, removeNotification } from '../../store/notifications';

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
  top: 12px;
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

.notification-success {
  border-color: color-mix(in srgb, var(--accent-color, #31d279) 45%, #d4d4d8);
}

.notification-error {
  border-color: #f5c2c7;
  background: #fff5f5;
}

.notification-info {
  border-color: #bfdbfe;
  background: #f8fbff;
}

.notification-close {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0;
}
</style>
