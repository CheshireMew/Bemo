<template>
  <div class="user-profile">
    <h2 class="username">Bemo Notes <span class="badge">PRO</span></h2>
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
</script>

<style scoped>
.user-profile {
  margin-bottom: 20px;
}
.username { 
  font-size: 1.05rem; 
  font-weight: 600; 
  display: flex; 
  align-items: center; 
  gap: 6px; 
  margin-bottom: 16px; 
  color: var(--text-primary); 
}
.badge { 
  background: var(--text-secondary); 
  color: var(--bg-main); 
  margin-top:2px; 
  font-size: 0.6rem; 
  padding: 2px 6px; 
  border-radius: 4px; 
  font-weight: bold; 
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
</style>
