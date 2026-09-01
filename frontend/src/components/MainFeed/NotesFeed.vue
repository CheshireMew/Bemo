<template>
  <div class="notes-feed" :aria-busy="notesLoading || searchLoading">
    <div v-if="notesReadError" class="filter-bar filter-bar-error" role="alert">
      <span>{{ notesReadError }} 当前显示已读取的内容，可能不是最新数据。</span>
      <button class="filter-clear" type="button" :disabled="notesLoading" @click="fetchNotes">{{ notesLoading ? '正在重试…' : '重试' }}</button>
    </div>
    <div v-if="searchError" class="filter-bar filter-bar-error" role="alert">
      <span>{{ searchError }}</span>
      <button class="filter-clear" type="button" @click="performSearch(searchQuery)">重试</button>
    </div>
    <div v-if="showInlineFilters && selectedDate" class="filter-bar">
      <span>筛选：{{ selectedDate.toLocaleDateString() }}</span>
      <button type="button" class="filter-clear" aria-label="清除日期筛选" @click="selectedDate = null">×</button>
    </div>
    <div v-if="showInlineFilters && selectedTag" class="filter-bar">
      <span>标签：#{{ selectedTag }}</span>
      <button type="button" class="filter-clear" aria-label="清除标签筛选" @click="selectedTag = null">×</button>
    </div>
    
    <div v-if="notesLoading && notes.length === 0" class="loading-list" role="status">
      <span class="sr-only">正在读取笔记</span>
      <div v-for="index in 3" :key="index" class="note-skeleton" aria-hidden="true"></div>
    </div>

    <div v-else-if="searchLoading" class="feed-state compact-state" role="status">
      正在搜索“{{ searchQuery.trim() }}”…
    </div>

    <div v-else-if="displayedNotes.length === 0 && !searchError && (!notesReadError || notes.length > 0)" class="feed-state" role="status">
      <template v-if="searchQuery.trim()">
        <strong>没有找到匹配的笔记</strong>
        <span>可以换一个关键词，或清除搜索后继续浏览。</span>
      </template>
      <template v-else-if="selectedDate || selectedTag">
        <strong>当前筛选下没有笔记</strong>
        <span>清除日期或标签筛选后，可以查看全部内容。</span>
      </template>
      <template v-else>
        <strong>从第一条笔记开始</strong>
        <span>{{ showInlineFilters ? '在上方记录想法、待办或灵感，发送后会出现在这里。' : '点击底部的记录按钮，写下你的第一条笔记。' }}</span>
      </template>
      <button v-if="searchQuery.trim() || selectedDate || selectedTag" type="button" class="load-more-btn" @click="resetFilters">查看全部笔记</button>
    </div>

    <PagedNoteList :notes="displayedNotes" :reset-key="listResetKey" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  displayedNotes,
  fetchNotes,
  notes,
  notesLoading,
  notesReadError,
  performSearch,
  searchError,
  searchLoading,
  searchQuery,
  selectedDate,
  selectedTag,
  sortOrder,
  clearSearch,
  clearSelectedFilters,
} from '../../store/notes';
import { getProductShell } from '../../domain/runtime/shellRuntime';
import PagedNoteList from './PagedNoteList.vue';

const showInlineFilters = computed(() => getProductShell() !== 'mobile');
const listResetKey = computed(() => JSON.stringify([searchQuery.value, selectedTag.value, selectedDate.value, sortOrder.value]));
const resetFilters = () => { clearSearch(); clearSelectedFilters(); };
</script>

<style scoped>
.notes-feed { 
  display: flex; 
  flex-direction: column; 
  gap: 10px; 
  margin-top: 18px; 
}
.filter-bar { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  padding: 8px 12px; 
  background: var(--accent-sidebar-bg); 
  border-radius: var(--radius-md); 
  font-size: var(--font-size-small);
  font-weight: 400;
  color: var(--accent-color); 
  margin-bottom: 12px; 
}
.filter-clear { 
  background: none; 
  border: none; 
  font-size: 1.1rem; 
  color: var(--accent-color); 
  cursor: pointer; 
  padding: 0 4px; 
}

.filter-bar-error {
  background: color-mix(in srgb, var(--danger-color) 10%, var(--bg-card));
  color: var(--danger-text);
}

.filter-bar-error .filter-clear {
  color: inherit;
  font-size: var(--font-size-small);
  font-weight: 700;
}

.loading-list {
  display: grid;
  gap: 10px;
}

.note-skeleton {
  height: 126px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: linear-gradient(90deg, var(--bg-card) 25%, var(--bg-main) 50%, var(--bg-card) 75%);
  background-size: 200% 100%;
  animation: feed-loading 1.3s ease-in-out infinite;
}

.feed-state {
  min-height: 190px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 20px;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-card) 72%, transparent);
  color: var(--text-secondary);
  text-align: center;
}

.feed-state strong {
  color: var(--text-primary);
  font-size: 1rem;
}

.feed-state span {
  max-width: 420px;
  font-size: var(--font-size-supporting);
  line-height: 1.55;
}

.compact-state {
  min-height: 90px;
}

.load-more-btn {
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-card);
  color: var(--text-primary);
  padding: 9px 16px;
  font: inherit;
  font-size: var(--font-size-small);
  font-weight: 500;
  cursor: pointer;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes feed-loading {
  from { background-position: 100% 0; }
  to { background-position: -100% 0; }
}

@media (max-width: 767px) {
  .notes-feed {
    margin-top: 10px;
  }
}
</style>
