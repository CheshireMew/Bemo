<template>
  <div>
    <div class="nav-section-title">全部标签</div>
    <div class="tag-list">
      <span 
        v-for="tag in allTags" :key="tag" 
        class="tag-badge" 
        :class="{ active: selectedTag === tag }"
        @click="toggleTag(tag)"
      >#{{ tag }}</span>
      <span v-if="allTags.length === 0" class="tag-empty">暂无标签</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { allTags, selectedTag, toggleTag } from '../../store/notes';
</script>

<style scoped>
.nav-section-title { 
  font-size: 0.8rem; 
  color: #d0a56e; 
  margin: 16px 12px 8px; 
  font-weight: 500; 
}
.tag-list { 
  display: flex; 
  flex-wrap: wrap; 
  gap: 6px; 
  padding: 4px 12px; 
  margin-bottom: 16px; 
}
.tag-badge { 
  font-size: 0.75rem; 
  color: var(--accent-color); 
  background: var(--accent-sidebar-bg); 
  padding: 3px 10px; 
  border-radius: 12px; 
  cursor: pointer; 
  transition: all 0.15s;
}
.tag-badge:hover { 
  background: var(--accent-color); 
  color: white; 
}
.tag-badge.active { 
  background: var(--accent-color); 
  color: white; 
  font-weight: 600; 
}
.tag-empty { 
  font-size: 0.75rem; 
  color: #ccc; 
  padding: 0 4px; 
}
</style>
