<template>
  <div class="tag-section">
    <div class="nav-section-header">
      <div class="nav-section-title">全部标签</div>
      <button
        v-if="allTagStats.length > visibleLimit && !tagSearch"
        type="button"
        class="toggle-link"
        @click="expanded = !expanded"
      >
        {{ expanded ? '收起' : `更多 ${allTagStats.length - visibleLimit}` }}
      </button>
    </div>

    <div class="tag-search-wrap">
      <input
        v-model.trim="tagSearch"
        type="text"
        class="tag-search"
        placeholder="搜索标签"
      />
    </div>

    <div class="tag-list">
      <button
        v-for="tag in visibleTags"
        :key="tag.name"
        type="button"
        class="tag-badge"
        :class="{ active: selectedTag === tag.name }"
        :title="`#${tag.name} (${tag.count})`"
        @click="handleTagClick(tag.name)"
      >
        <span class="tag-name">#{{ tag.name }}</span>
        <span class="tag-count">{{ tag.count }}</span>
      </button>
      <span v-if="allTagStats.length === 0" class="tag-empty">暂无标签</span>
      <span v-else-if="visibleTags.length === 0" class="tag-empty">没有匹配的标签</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { notes, selectedTag, toggleTag } from '../../store/notes';

const emit = defineEmits<{
  navigate: [];
}>();

const visibleLimit = 10;
const expanded = ref(false);
const tagSearch = ref('');

const allTagStats = computed(() => {
  const counts = new Map<string, number>();
  for (const note of notes.value) {
    for (const tag of note.tags || []) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
});

const filteredTags = computed(() => {
  const query = tagSearch.value.trim().toLowerCase();
  if (!query) return allTagStats.value;
  return allTagStats.value.filter((tag) => tag.name.toLowerCase().includes(query));
});

const visibleTags = computed(() => {
  if (tagSearch.value.trim()) return filteredTags.value;
  if (expanded.value) return filteredTags.value;
  return filteredTags.value.slice(0, visibleLimit);
});

const handleTagClick = (tagName: string) => {
  toggleTag(tagName);
  emit('navigate');
};
</script>

<style scoped>
.tag-section {
  margin-bottom: 16px;
}

.nav-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 16px 12px 8px;
}

.nav-section-title {
  font-size: 0.8rem;
  color: #d0a56e;
  font-weight: 500;
}

.toggle-link {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0;
}

.toggle-link:hover {
  color: var(--text-primary);
}

.tag-search-wrap {
  padding: 0 12px 8px;
}

.tag-search {
  width: 100%;
  border: 1px solid var(--border-color, #d4d4d8);
  background: color-mix(in srgb, var(--bg-card, #fff) 60%, transparent);
  color: var(--text-primary, #18181b);
  border-radius: 10px;
  padding: 8px 10px;
  font: inherit;
  font-size: 0.84rem;
}

.tag-search:focus {
  outline: 2px solid color-mix(in srgb, var(--accent-color, #31d279) 18%, transparent);
  border-color: var(--accent-color, #31d279);
}

.tag-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 12px 4px;
}

.tag-badge {
  width: 100%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  text-align: left;
  font-size: 0.78rem;
  color: var(--accent-color);
  background: var(--accent-sidebar-bg);
  padding: 7px 10px;
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

.tag-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-count {
  flex-shrink: 0;
  font-size: 0.72rem;
  opacity: 0.75;
}

.tag-empty {
  font-size: 0.75rem;
  color: #ccc;
  padding: 4px 2px 0;
}
</style>
