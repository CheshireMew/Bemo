<template>
  <header class="mobile-topbar">
    <ShellTopbarControls
      show-sidebar-toggle
      search-placeholder=""
      @openSidebar="emit('openSidebar')"
      @openSettings="emit('openSettings')"
    />

    <div v-if="hasFilters" class="filter-row">
      <button v-if="selectedTag" class="filter-pill" type="button" @click="selectedTag = null">#{{ selectedTag }} ×</button>
      <button v-if="selectedDate" class="filter-pill" type="button" @click="selectedDate = null">
        {{ selectedDate.toLocaleDateString() }} ×
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ShellTopbarControls from '../shared/ShellTopbarControls.vue';
import { selectedDate, selectedTag } from '../../../store/notes';

const emit = defineEmits<{
  openSidebar: [];
  openSettings: [];
}>();

const hasFilters = computed(() => Boolean(selectedTag.value || selectedDate.value));
</script>

<style scoped>
.mobile-topbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: calc(12px + var(--safe-top)) 0 14px;
  background: color-mix(in srgb, var(--bg-main) 92%, transparent);
  backdrop-filter: blur(16px);
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-pill {
  border: none;
  border-radius: 999px;
  padding: 6px 10px;
  background: var(--accent-sidebar-bg, #e6f7ef);
  color: var(--accent-color, #31d279);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}
</style>
