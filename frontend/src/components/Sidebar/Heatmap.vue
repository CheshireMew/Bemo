<template>
  <div class="heatmap-section">
    <div
      ref="heatmapContainer"
      class="heatmap"
      :style="{
        '--heatmap-cell-size': `${cellSize}px`,
        '--heatmap-gap': `${heatmapGap}px`,
      }"
    >
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useHeatmap } from '../../composables/useHeatmap';
import { selectDate } from '../../store/notes';

const { heatmapData, heatmapMonths } = useHeatmap();
const heatmapContainer = ref<HTMLElement | null>(null);
const cellSize = ref(12);
const viewportWidth = ref(typeof window === 'undefined' ? 1024 : window.innerWidth);
const heatmapGap = computed(() => (viewportWidth.value <= 767 ? 2 : 3));
const columnCount = computed(() => {
  const rows = 7;
  return Math.max(1, Math.ceil(heatmapData.value.length / rows));
});

let resizeObserver: ResizeObserver | null = null;
const handleResize = () => {
  viewportWidth.value = window.innerWidth;
  updateCellSize();
};

const updateCellSize = () => {
  const element = heatmapContainer.value;
  if (!element) return;

  const width = element.clientWidth;
  if (width <= 0) return;

  const gap = heatmapGap.value;
  const columns = columnCount.value;
  const availableWidth = width - gap * Math.max(0, columns - 1);
  const nextCellSize = availableWidth / columns;

  cellSize.value = Math.max(6, nextCellSize);
};

watch(heatmapData, () => {
  requestAnimationFrame(() => {
    updateCellSize();
  });
}, { immediate: true });

watch(heatmapGap, () => {
  requestAnimationFrame(() => {
    updateCellSize();
  });
});

onMounted(() => {
  window.addEventListener('resize', handleResize, { passive: true });
  resizeObserver = new ResizeObserver(() => updateCellSize());
  if (heatmapContainer.value) {
    resizeObserver.observe(heatmapContainer.value);
  }

  requestAnimationFrame(() => {
    viewportWidth.value = window.innerWidth;
    updateCellSize();
  });
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  resizeObserver?.disconnect();
});
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
  grid-template-rows: repeat(7, var(--heatmap-cell-size, 12px));
  grid-auto-flow: column;
  grid-auto-columns: var(--heatmap-cell-size, 12px);
  gap: var(--heatmap-gap, 3px);
  width: 100%;
  justify-content: stretch;
}

.heatmap-cell {
  width: var(--heatmap-cell-size, 12px);
  height: var(--heatmap-cell-size, 12px);
  aspect-ratio: 1 / 1;
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
