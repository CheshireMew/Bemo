<template>
  <div class="user-profile">
    <div class="brand-row">
      <div class="brand-block">
        <h2 class="username">
          <span class="brand-word brand-word-main">Bemo</span>
          <span class="brand-word brand-word-sub">Notes</span>
        </h2>
        <span class="badge">OSS</span>
      </div>
      <button v-if="showClose" type="button" class="close-btn" @click="emit('close')" aria-label="关闭导航">×</button>
    </div>
    <div class="stats">
      <div class="stat-item">
        <span class="stat-num">{{ notes.length }}</span>
        <span class="stat-label">笔记</span>
      </div>
      <div class="stat-item">
        <span class="stat-num">{{ allTags.length }}</span>
        <span class="stat-label">标签</span>
      </div>
      <div class="stat-item">
        <span class="stat-num">392</span>
        <span class="stat-label">天</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { notes, allTags } from '../../store/notes';

withDefaults(defineProps<{
  showClose?: boolean;
}>(), {
  showClose: false,
});

const emit = defineEmits<{
  close: [];
}>();
</script>

<style scoped>
.user-profile {
  margin-bottom: 20px;
}

.brand-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.brand-block {
  display: flex; 
  align-items: center; 
  gap: 10px;
  min-width: 0;
}

.username { 
  font-size: 1.16rem; 
  font-weight: 700; 
  letter-spacing: -0.03em;
  line-height: 1;
  color: var(--text-primary); 
  display: inline-flex;
  align-items: baseline;
  gap: 0.32rem;
  margin: 0;
}

.brand-word-main {
  font-weight: 800;
}

.brand-word-sub {
  font-weight: 650;
  color: color-mix(in srgb, var(--text-primary) 84%, var(--accent-color) 16%);
}

.badge { 
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 4px;
  border: 1px solid color-mix(in srgb, var(--accent-color) 40%, transparent);
  background: color-mix(in srgb, var(--accent-color) 15%, transparent);
  color: var(--accent-color);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1;
  text-transform: uppercase;
  transform: scale(0.8);
  transform-origin: left center;
}

.close-btn {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-card, #fff) 90%, transparent);
  color: var(--text-secondary);
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn:hover {
  color: var(--text-primary);
  background: var(--bg-card);
  border-color: color-mix(in srgb, var(--accent-color) 24%, var(--border-color));
}

.stats { 
  display: flex; 
  justify-content: space-between; 
  padding: 0; 
}
.stat-item { 
  display: flex; 
  flex-direction: column; 
  align-items: center; 
}
.stat-num { 
  font-size: 1.3rem; 
  font-weight: 700; 
  color: var(--text-secondary); 
}
.stat-label { 
  font-size: 0.75rem; 
  color: var(--text-secondary); 
  margin-top: 2px; 
}

@media (max-width: 767px) {
  .brand-row {
    margin-bottom: 14px;
  }

  .username {
    font-size: 1.1rem;
  }

  .badge {
    height: 18px;
    padding: 0 6px;
    font-size: 0.62rem;
    transform: scale(0.76);
  }
}
</style>
