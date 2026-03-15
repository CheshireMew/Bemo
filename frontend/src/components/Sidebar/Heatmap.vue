<template>
  <div class="heatmap-section">
    <div class="heatmap" ref="heatmapContainer" :style="{ 'grid-auto-columns': `1fr`, 'grid-template-rows': `repeat(7, 1fr)` }">
      <div 
        v-for="(day, index) in heatmapData" 
        :key="index"
        class="heatmap-cell"
        :class="[`level-${day.level}`, { today: day.isToday }]"
        :title="day.empty ? '' : `${day.date.toLocaleDateString()} : ${day.count} 篇笔记`"
        @click="!day.empty && selectDate(day.date)"
      ></div>
    </div>
    <!-- Months -->
    <div class="heatmap-months">
      <span v-for="m in heatmapMonths" :key="m">{{ m }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useHeatmap } from '../../composables/useHeatmap';
import { selectDate } from '../../store/notes';

const { heatmapData, heatmapMonths } = useHeatmap();
const heatmapContainer = ref<HTMLElement | null>(null);

watch(heatmapData, () => {
  requestAnimationFrame(() => {
    if (heatmapContainer.value) {
      heatmapContainer.value.scrollLeft = heatmapContainer.value.scrollWidth;
    }
  });
}, { immediate: true });
</script>

<style scoped>
.heatmap-section { 
  width: 100%; 
  display: flex; 
  flex-direction: column; 
  gap: 6px;
  margin-bottom: 16px;
}

.heatmap {
  display: grid;
  grid-template-rows: repeat(7, 1fr);
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 3px;
  width: 100%;
  height: 110px; /* 固定高度，组件尺寸永不变 */
}

.heatmap-cell {
  border-radius: 2px;
  cursor: help;
}
.heatmap-cell.today { outline: 2px solid var(--accent-color); outline-offset: -1px; }
.heatmap-cell.level-0 { background-color: var(--heatmap-0); }
.heatmap-cell.level-1 { background-color: var(--heatmap-1); }
.heatmap-cell.level-2 { background-color: var(--heatmap-2); }
.heatmap-cell.level-3 { background-color: var(--heatmap-3); }
.heatmap-cell.level-4 { background-color: var(--heatmap-4); }

.heatmap-months { 
  display: flex; 
  justify-content: space-between; 
  font-size: 0.75rem; 
  color: var(--text-secondary); 
  padding: 0 2px; 
}
</style>
