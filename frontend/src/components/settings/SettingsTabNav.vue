<template>
  <nav class="settings-nav" :class="layoutClass" aria-label="设置分组">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      class="tab-btn"
      :class="{ active: activeTab === tab.id }"
      @click="emit('update:activeTab', tab.id)"
    >
      <component :is="tab.icon" class="tab-icon" :size="18" />
      <span class="tab-label">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SettingsTab, SettingsTabId } from '../../composables/useSettingsTabs';

const props = withDefaults(defineProps<{
  tabs: SettingsTab[];
  activeTab: SettingsTabId;
  layout?: 'sidebar' | 'mobile-tabs';
}>(), {
  layout: 'sidebar',
});

const emit = defineEmits<{
  'update:activeTab': [value: SettingsTabId];
}>();

const layoutClass = computed(() => (
  props.layout === 'mobile-tabs'
    ? 'settings-nav-mobile'
    : 'settings-nav-sidebar'
));
</script>

<style scoped>
.settings-nav {
  display: flex;
  gap: 8px;
}

.settings-nav-sidebar {
  width: var(--layout-sidebar-width);
  flex-shrink: 0;
  padding: 24px 20px 24px 24px;
  flex-direction: column;
  background: color-mix(in srgb, var(--bg-main) 86%, #f2fbf6);
}

.settings-nav-mobile {
  width: auto;
  padding: 12px 16px;
  overflow-x: auto;
  flex-direction: row;
  border-bottom: 1px solid var(--border-color, #e4e4e7);
}

.tab-btn {
  text-align: left;
  padding: 10px 14px;
  border: 1px solid transparent;
  border-radius: var(--radius-md, 0.5rem);
  background: transparent;
  color: var(--text-secondary, #888888);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  font-size: 0.95rem;
  font-weight: 500;
  line-height: 1.45;
}

.settings-nav-sidebar .tab-btn {
  width: 100%;
}

.settings-nav-mobile .tab-btn {
  width: auto;
  white-space: nowrap;
  flex-shrink: 0;
}

.tab-btn.active {
  background: var(--accent-color, #31d279);
  color: white;
  font-weight: 600;
}

.tab-btn:hover:not(.active) {
  background: var(--border-color, #eaeaea);
  color: var(--text-primary, #333333);
}

.tab-icon {
  flex-shrink: 0;
  opacity: 0.8;
}

.tab-btn.active .tab-icon {
  color: white;
  opacity: 1;
}

.tab-label {
  display: inline-block;
}
</style>
