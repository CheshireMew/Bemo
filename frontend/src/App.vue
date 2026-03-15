<template>
  <div id="app" class="flomo-layout">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="user-profile">
        <h2 class="username">Bemo Notes <span class="badge">PRO</span></h2>
        <div class="stats">
          <div class="stat-item">
            <span class="stat-num">{{ notes.length }}</span>
            <span class="stat-label">笔记</span>
          </div>
          <div class="stat-item">
            <span class="stat-num">0</span>
            <span class="stat-label">标签</span>
          </div>
          <div class="stat-item">
            <span class="stat-num">392</span>
            <span class="stat-label">天</span>
          </div>
        </div>
        
        <!-- Mini Calendar -->
        <div class="mini-calendar">
          <div class="cal-header">
            <button class="cal-nav" @click="prevMonth">&lt;</button>
            <span class="cal-title">{{ calendarTitle }}</span>
            <button class="cal-nav" @click="nextMonth">&gt;</button>
          </div>
          <div class="cal-weekdays">
            <span v-for="w in ['日','一','二','三','四','五','六']" :key="w">{{ w }}</span>
          </div>
          <div class="cal-grid">
            <div 
              v-for="(d, i) in calendarDays" :key="i"
              class="cal-day"
              :class="{ 
                'other-month': d.otherMonth, 
                'today': d.isToday,
                'selected': d.isSelected,
                'has-notes': d.hasNotes
              }"
              @click="selectDate(d.date)"
            >{{ d.day }}</div>
          </div>
        </div>

        <!-- Heatmap Section -->
        <div class="heatmap-section">
          <div class="heatmap" :style="{ 'grid-auto-columns': `1fr`, 'grid-template-rows': `repeat(7, 1fr)` }">
            <div 
              v-for="(day, index) in heatmapData" 
              :key="index" 
              class="heatmap-cell" 
              :class="[`level-${day.level}`, { today: day.isToday }]"
              :title="`${day.date.toLocaleDateString()} : ${day.count} 篇笔记`"
              @click="!day.empty && selectDate(day.date)"
            ></div>
          </div>
          
          <!-- Months -->
          <div class="heatmap-months">
            <span v-for="m in heatmapMonths" :key="m">{{ m }}</span>
          </div>
          
        </div>
      </div>

      <nav class="nav-menu">
        <a href="#" class="nav-item active">
          <LayoutGrid class="icon" :size="18" /> 全部笔记
        </a>
        <a href="#" class="nav-item">
          <MessageSquareText class="icon" :size="18" /> 微信输入
        </a>
        <a href="#" class="nav-item">
          <CalendarSync class="icon" :size="18" /> 每日回顾
        </a>
        <a href="#" class="nav-item">
          <Zap class="icon" :size="18" /> AI 洞察
        </a>
        <a href="#" class="nav-item">
          <Dices class="icon" :size="18" /> 随机漫步
        </a>
      </nav>

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

      <nav class="nav-menu bottom-menu">
        <a href="#" class="nav-item" :class="{ active: showTrash }" @click.prevent="toggleTrashView">
          <Trash2 class="icon" :size="18" /> 回收站
          <span v-if="trashNotes.length" class="trash-count">{{ trashNotes.length }}</span>
        </a>
      </nav>
    </aside>

    <!-- Main Feed -->
    <main class="main-content">
      <header class="topbar">
        <div class="brand">bemo <span>v</span></div>
        <div class="sync-status" v-if="syncStatus !== 'online'">
          <span v-if="syncStatus === 'offline'">✈️ 离线模式{{ pendingCount > 0 ? ` · ${pendingCount}条待同步` : '' }}</span>
          <span v-else-if="syncStatus === 'syncing'">🔄 同步中… 剩余{{ pendingCount }}条</span>
        </div>
        <div class="search-box">
          <Search class="search-icon" :size="16" />
          <input type="text" v-model="searchQuery" placeholder="Ctrl+K 或直接搜索..." />
          <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">×</button>
        </div>
      </header>

      <div class="feed-container">
        <!-- Trash View -->
        <div v-if="showTrash" class="trash-view">
          <div class="trash-header">
            <h3>🗑️ 回收站</h3>
            <button v-if="trashNotes.length" class="btn-empty-trash" @click="emptyTrash">清空回收站</button>
          </div>
          <div v-if="trashNotes.length === 0" class="trash-empty">回收站是空的</div>
          <div v-for="note in trashNotes" :key="note.filename" class="note-card trash-card">
            <div class="note-header">
              <span class="note-date">删除于 {{ formatDate(note.updated_at) }}</span>
              <div class="note-actions" style="opacity:1">
                <button class="btn-action btn-restore" title="恢复" @click="restoreNote(note.filename)"><RotateCcw :size="14" /></button>
                <button class="btn-action" title="永久删除" @click="permanentDelete(note.filename)"><Trash2 :size="14" /></button>
              </div>
            </div>
            <div class="note-body markdown-body" v-html="renderMarkdown(note.content)"></div>
          </div>
        </div>

        <!-- Normal View -->
        <template v-else>
          <Editor @saved="onNoteSaved" />
          <div class="notes-feed">
          <div v-if="selectedDate" class="filter-bar">
            <span>筛选：{{ selectedDate.toLocaleDateString() }}</span>
            <button class="filter-clear" @click="selectedDate = null">×</button>
          </div>
          <div v-if="selectedTag" class="filter-bar">
            <span>标签：#{{ selectedTag }}</span>
            <button class="filter-clear" @click="selectedTag = null">×</button>
          </div>
          <div v-for="note in displayedNotes" :key="note.filename" class="note-card" :class="{ pinned: note.pinned }">
            <div class="note-header">
              <span class="note-date">{{ note.pinned ? '📌 ' : '' }}{{ formatDate(note.created_at) }}</span>
              <div class="note-actions">
                <button class="btn-action" title="编辑" @click="startEdit(note)"><Pencil :size="14" /></button>
                <button class="btn-action" :title="note.pinned ? '取消置顶' : '置顶'" @click="togglePin(note)"><Pin :size="14" :class="{ 'pin-active': note.pinned }" /></button>
                <button class="btn-action" title="删除" @click="deleteNote(note.filename)"><Trash2 :size="14" /></button>
              </div>
            </div>
            <!-- Tags -->
            <div v-if="note.tags && note.tags.length" class="note-tags">
              <span v-for="t in note.tags" :key="t" class="note-tag" @click="toggleTag(t)">#{{ t }}</span>
            </div>
            <!-- Edit Mode -->
            <div v-if="editingNote === note.filename" class="edit-area">
              <textarea v-model="editContent" class="edit-input"></textarea>
              <div class="edit-actions">
                <button class="btn-save" @click="saveEdit(note.filename)">保存</button>
                <button class="btn-cancel" @click="cancelEdit">取消</button>
              </div>
            </div>
            <!-- View Mode -->
            <div v-else class="note-body markdown-body" v-html="renderMarkdown(note.content)"></div>
          </div>
        </div>
        </template>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch, onUnmounted } from 'vue';
import axios from 'axios';
import { marked } from 'marked';
import Editor from './components/Editor.vue';
import { setCachedNotes, getCachedNotes } from './utils/db';
import { onSyncStatusChange, flushPendingQueue, type SyncStatus } from './utils/sync';
import { API_BASE } from './config';
import { 
  LayoutGrid, MessageSquareText, CalendarSync, 
  Zap, Dices, Trash2, Search, Pencil, Pin, RotateCcw 
} from 'lucide-vue-next';

interface NoteMeta {
  filename: string;
  title: string;
  created_at: number;
  updated_at: number;
  content: string;
  tags: string[];
  pinned: boolean;
}

const notes = ref<NoteMeta[]>([]);
const HEATMAP_DAYS = 105;
const selectedDate = ref<Date | null>(null);
const selectedTag = ref<string | null>(null);
const calendarMonth = ref(new Date());
const searchQuery = ref('');
const editingNote = ref<string | null>(null);
const editContent = ref('');
const showTrash = ref(false);
const trashNotes = ref<NoteMeta[]>([]);
const syncStatus = ref<SyncStatus>('online');
const pendingCount = ref(0);

// 日历标题
const calendarTitle = computed(() => {
  const d = calendarMonth.value;
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
});

// 上一月/下一月
const prevMonth = () => {
  const d = new Date(calendarMonth.value);
  d.setMonth(d.getMonth() - 1);
  calendarMonth.value = d;
};
const nextMonth = () => {
  const d = new Date(calendarMonth.value);
  d.setMonth(d.getMonth() + 1);
  calendarMonth.value = d;
};

// 点击日期：再次点击同一天取消筛选
const selectDate = (date: Date) => {
  if (selectedDate.value && selectedDate.value.toDateString() === date.toDateString()) {
    selectedDate.value = null;
  } else {
    selectedDate.value = new Date(date);
    selectedDate.value.setHours(0, 0, 0, 0);
  }
};

// 过滤笔记（日期 + 标签 + 搜索）
const filteredNotes = computed(() => {
  let result = notes.value;
  
  if (selectedDate.value) {
    const sel = selectedDate.value;
    result = result.filter(n => {
      const d = new Date(n.created_at * 1000);
      return d.getFullYear() === sel.getFullYear() && d.getMonth() === sel.getMonth() && d.getDate() === sel.getDate();
    });
  }
  
  if (selectedTag.value) {
    const tag = selectedTag.value;
    result = result.filter(n => n.tags && n.tags.includes(tag));
  }
  
  return result;
});

// 搜索笔记（防抖 300ms）
let searchTimer: ReturnType<typeof setTimeout> | null = null;
const searchResults = ref<NoteMeta[] | null>(null);

watch(searchQuery, (q) => {
  if (searchTimer) clearTimeout(searchTimer);
  if (!q.trim()) {
    searchResults.value = null;
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const res = await axios.get(`${API_BASE}/notes/search`, { params: { q } });
      searchResults.value = res.data;
    } catch (e) { console.error(e); }
  }, 300);
});

// 展示的笔记列表：搜索结果 > 过滤结果
const displayedNotes = computed(() => {
  return searchResults.value !== null ? searchResults.value : filteredNotes.value;
});

// 标签相关
const allTags = computed(() => {
  const set = new Set<string>();
  notes.value.forEach(n => (n.tags || []).forEach(t => set.add(t)));
  return Array.from(set).sort();
});

const toggleTag = (tag: string) => {
  selectedTag.value = selectedTag.value === tag ? null : tag;
};

// 编辑相关
const startEdit = (note: NoteMeta) => {
  editingNote.value = note.filename;
  editContent.value = note.content;
};

const cancelEdit = () => {
  editingNote.value = null;
  editContent.value = '';
};

const saveEdit = async (filename: string) => {
  try {
    await axios.put(`${API_BASE}/notes/${filename}`, { content: editContent.value });
    editingNote.value = null;
    editContent.value = '';
    await fetchNotes();
  } catch (e) { console.error(e); alert('保存失败'); }
};

// 置顶/取消置顶
const togglePin = async (note: NoteMeta) => {
  try {
    await axios.patch(`${API_BASE}/notes/${note.filename}`, { pinned: !note.pinned });
    await fetchNotes();
  } catch (e) { console.error(e); }
};

// 日历网格数据
const calendarDays = computed(() => {
  const year = calendarMonth.value.getFullYear();
  const month = calendarMonth.value.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const todayStr = new Date().toDateString();
  const selectedStr = selectedDate.value?.toDateString();
  
  // 笔记日期集合
  const noteDates = new Set<string>();
  notes.value.forEach(n => {
    noteDates.add(new Date(n.created_at * 1000).toDateString());
  });
  
  const days: { day: number, date: Date, otherMonth: boolean, isToday: boolean, isSelected: boolean, hasNotes: boolean }[] = [];
  
  // 填充上月尾巴
  for (let i = 0; i < firstDay.getDay(); i++) {
    const d = new Date(year, month, -firstDay.getDay() + i + 1);
    days.push({ day: d.getDate(), date: d, otherMonth: true, isToday: false, isSelected: false, hasNotes: false });
  }
  
  // 本月
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const d = new Date(year, month, i);
    days.push({ 
      day: i, date: d, otherMonth: false, 
      isToday: d.toDateString() === todayStr,
      isSelected: d.toDateString() === selectedStr,
      hasNotes: noteDates.has(d.toDateString())
    });
  }
  
  // 填充下月开头
  const remaining = 42 - days.length; // 6行
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    days.push({ day: i, date: d, otherMonth: true, isToday: false, isSelected: false, hasNotes: false });
  }
  
  return days;
});

const fetchNotes = async () => {
  try {
    const res = await axios.get(`${API_BASE}/notes/`);
    notes.value = res.data;
    // Cache to IndexedDB for offline access
    setCachedNotes(res.data).catch(() => {});
  } catch (error) {
    console.error("Failed to fetch notes, trying offline cache", error);
    // Fallback to IndexedDB cache
    try {
      const cached = await getCachedNotes();
      if (cached.length > 0) notes.value = cached;
    } catch (e) { /* IndexedDB also failed */ }
  }
};

const onNoteSaved = async () => {
  await fetchNotes();
};

const deleteNote = async (filename: string) => {
  try {
    await axios.delete(`${API_BASE}/notes/${filename}`);
    await fetchNotes();
  } catch(e) { console.error(e); }
};

// 回收站
const toggleTrashView = async () => {
  showTrash.value = !showTrash.value;
  if (showTrash.value) await fetchTrash();
};

const fetchTrash = async () => {
  try {
    const res = await axios.get(`${API_BASE}/notes/trash/list`);
    trashNotes.value = res.data;
  } catch(e) { console.error(e); }
};

const restoreNote = async (filename: string) => {
  try {
    await axios.post(`${API_BASE}/notes/trash/restore/${filename}`);
    await fetchTrash();
    await fetchNotes();
  } catch(e) { console.error(e); }
};

const permanentDelete = async (filename: string) => {
  if (!confirm('永久删除后无法恢复，确定吗？')) return;
  try {
    await axios.delete(`${API_BASE}/notes/trash/permanent/${filename}`);
    await fetchTrash();
  } catch(e) { console.error(e); }
};

const emptyTrash = async () => {
  if (!confirm('清空回收站后无法恢复，确定吗？')) return;
  try {
    await axios.delete(`${API_BASE}/notes/trash/empty`);
    trashNotes.value = [];
  } catch(e) { console.error(e); }
};

const formatDate = (timestamp: number) => {
  const d = new Date(timestamp * 1000);
  return d.getFullYear() + '-' + 
         String(d.getMonth()+1).padStart(2, '0') + '-' + 
         String(d.getDate()).padStart(2, '0') + ' ' + 
         String(d.getHours()).padStart(2, '0') + ':' + 
         String(d.getMinutes()).padStart(2, '0');
};

const renderMarkdown = (content: string) => {
  return marked.parse(content || '');
};

// 热图数据：固定显示 HEATMAP_DAYS 天
const heatmapData = computed(() => {
  const days = HEATMAP_DAYS;
  const data: { date: Date, count: number, level: number, empty?: boolean, isToday?: boolean }[] = [];
  
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - days + 1);
  startDate.setHours(0, 0, 0, 0);

  // 周对齐填充：开始日前面填空白格子使其对齐到正确的星期几行
  const startDayOfWeek = startDate.getDay(); // 0=Sun, 6=Sat
  for (let i = 0; i < startDayOfWeek; i++) {
    data.push({ date: new Date(), count: 0, level: -1, empty: true });
  }

  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    data.push({ date: d, count: 0, level: 0, isToday: false });
  }

  notes.value.forEach(note => {
    const noteDate = new Date(note.created_at * 1000);
    noteDate.setHours(0, 0, 0, 0);
    const item = data.find(d => !d.empty && d.date.getTime() === noteDate.getTime());
    if (item) item.count++;
  });

  data.forEach(item => {
    if (!item.empty) {
      if (item.count === 0) item.level = 0;
      else if (item.count === 1) item.level = 1;
      else if (item.count === 2) item.level = 2;
      else if (item.count === 3) item.level = 3;
      else item.level = 4;
    }
  });

  // 标记今天
  const todayStr = new Date().toDateString();
  data.forEach(item => {
    if (!item.empty && item.date.toDateString() === todayStr) {
      item.isToday = true;
    }
  });

  return data;
});

const heatmapMonths = computed(() => {
  const seen = new Set<number>();
  const res: string[] = [];
  heatmapData.value.forEach(d => {
    if (d.empty) return;
    const m = d.date.getMonth() + 1;
    if (!seen.has(m)) {
      seen.add(m);
      res.push(`${m}月`);
    }
  });
  return res;
});

// 同步状态监听
let unsubSync: (() => void) | null = null;

onMounted(() => {
  fetchNotes();
  // Listen for sync status changes
  unsubSync = onSyncStatusChange((status, count) => {
    syncStatus.value = status;
    pendingCount.value = count;
    // After sync completes, refresh notes
    if (status === 'online' && count === 0) fetchNotes();
  });
  // Try to flush any pending items from previous session
  flushPendingQueue().catch(() => {});
});

onUnmounted(() => {
  if (unsubSync) unsubSync();
});
</script>

<style>
/* CSS Reset and Global - Inspired by Memos default theme */
:root {
  --bg-main: #f4f5f7;         /* Flomo/Memos outer background */
  --bg-sidebar: transparent;  /* Sidebar sits on the bg */
  --bg-card: #ffffff;
  --text-primary: #333333;
  --text-secondary: #888888;
  --border-color: #eaeaea;
  --accent-color: #31d279;    /* Flomo green */
  --accent-hover: #2bba6a;
  --accent-sidebar-bg: #e6f7ef;
  
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-sans);
  background-color: var(--bg-main);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
}

/* 整个应用容器居中，两侧自动留白 */
.flomo-layout {
  display: flex;
  height: 100vh;
  max-width: 1040px; /* 控制总宽度 */
  margin: 0 auto;    /* 居中 */
  overflow: hidden;
}

/* Sidebar Styling */
.sidebar {
  width: 300px; /* larger sidebar to fit heatmap comfortably */
  background-color: var(--bg-sidebar);
  display: flex;
  flex-direction: column;
  padding: 32px 20px;
  overflow-y: auto;
  /* 取消右侧分割线，采用留白区隔 */
}

.user-profile { margin-bottom: 24px; padding: 0 4px; }
.username { 
  font-size: 1.05rem; 
  font-weight: 600; 
  display: flex; 
  align-items: center; 
  gap: 6px; 
  margin-bottom: 16px; 
  color: #111; 
}
.badge { background: #bbb; color: white; margin-top:2px; font-size: 0.6rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; }
.stats { display: flex; justify-content: space-between; margin-bottom: 20px; padding: 0; }
.stat-item { display: flex; flex-direction: column; align-items: center; }
.stat-num { font-size: 1.3rem; font-weight: 700; color: #888; }
.stat-label { font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px; }

.heatmap-section { 
  width: 100%; 
  display: flex; 
  flex-direction: column; 
  gap: 6px; 
}

/* Mini Calendar */
.mini-calendar { width: 100%; margin-bottom: 16px; }
.cal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.cal-title { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); }
.cal-nav { background: none; border: none; font-size: 0.85rem; color: var(--text-secondary); cursor: pointer; padding: 4px 8px; border-radius: 4px; }
.cal-nav:hover { background: #eaeaea; }
.cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 4px; }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.cal-day { 
  text-align: center; font-size: 0.75rem; padding: 4px 0; 
  border-radius: 4px; cursor: pointer; color: var(--text-primary);
  transition: all 0.15s;
}
.cal-day:hover { background: #eaeaea; }
.cal-day.other-month { color: #ccc; }
.cal-day.today { font-weight: 700; color: var(--accent-color); }
.cal-day.selected { background: var(--accent-color); color: white; font-weight: 600; }
.cal-day.has-notes { position: relative; }
.cal-day.has-notes::after { content: ''; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; border-radius: 50%; background: var(--accent-color); }
.cal-day.selected.has-notes::after { background: white; }

/* Filter Bar */
.filter-bar { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--accent-sidebar-bg); border-radius: var(--radius-md); font-size: 0.85rem; color: var(--accent-color); margin-bottom: 12px; }
.filter-clear { background: none; border: none; font-size: 1.1rem; color: var(--accent-color); cursor: pointer; padding: 0 4px; }

/* Trash View */
.trash-view { margin-top: 24px; }
.trash-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.trash-header h3 { font-size: 1.1rem; font-weight: 600; color: var(--text-primary); }
.btn-empty-trash { 
  background: #fee2e2; color: #ef4444; border: none; 
  padding: 6px 14px; border-radius: var(--radius-md); cursor: pointer;
  font-size: 0.8rem; transition: all 0.15s;
}
.btn-empty-trash:hover { background: #fecaca; }
.trash-empty { text-align: center; color: #ccc; padding: 40px; font-size: 0.9rem; }
.trash-card { opacity: 0.7; border-style: dashed; }
.trash-card:hover { opacity: 1; }
.btn-restore { color: var(--accent-color) !important; }
.trash-count { 
  background: #ef4444; color: white; font-size: 0.65rem; 
  padding: 1px 6px; border-radius: 10px; margin-left: auto;
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
.heatmap-cell.level-0 { background-color: #e4e4e7; }
.heatmap-cell.level--1 { background-color: transparent; cursor: default; }
.heatmap-cell.level-1 { background-color: #d1fae5; }
.heatmap-cell.level-2 { background-color: #6ee7b7; }
.heatmap-cell.level-3 { background-color: #10b981; }
.heatmap-cell.level-4 { background-color: #047857; }

.heatmap-months { 
  display: flex; 
  justify-content: space-between; 
  font-size: 0.75rem; 
  color: var(--text-secondary); 
  padding: 0 2px; 
}



.nav-menu { display: flex; flex-direction: column; gap: 4px; margin-bottom: 24px; }
.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  text-decoration: none; color: #555; border-radius: var(--radius-md); 
  font-size: 0.95rem; font-weight: 500;
  transition: all 0.15s ease;
}
.nav-item:hover { background-color: #eaeaea; }
.nav-item.active { background-color: var(--accent-color); color: white; font-weight: 600;}
.nav-item.active .icon { color: white; }
.icon { color: #888; }

.nav-section-title { font-size: 0.8rem; color: #d0a56e; margin: 16px 12px 8px; font-weight: 500; }
.bottom-menu { margin-top: auto; margin-bottom: 0; }

/* Main Content Styling */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  position: relative;
  /* 给主内容区左侧加一点间距，使其脱离侧边栏 */
  padding-left: 20px;
}

.topbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 32px 0 24px 0; 
  position: sticky; top: 0; background: var(--bg-main); z-index: 10;
}
.brand { font-size: 1.1rem; font-weight: 700; color: #111; display: flex; align-items: baseline; gap: 4px; }
.brand span { font-size: 0.75rem; font-weight: normal; color: var(--text-secondary); }
.search-box {
  background: #e8eaed; border-radius: 20px; padding: 6px 16px;
  display: flex; align-items: center; gap: 8px; width: 260px; position: relative;
}
.search-box input { border: none; background: transparent; outline: none; width: 100%; font-size: 0.85rem; color: var(--text-primary); }
.search-box input::placeholder { color: #888; }
.search-icon { color: #888; }
.search-clear { background: none; border: none; font-size: 1rem; color: #888; cursor: pointer; padding: 0 2px; }

.feed-container {
  width: 100%; padding: 0 0 64px;
}

/* Tag List in Sidebar */
.tag-list { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 12px; margin-bottom: 16px; }
.tag-badge { 
  font-size: 0.75rem; color: var(--accent-color); background: var(--accent-sidebar-bg); 
  padding: 3px 10px; border-radius: 12px; cursor: pointer; transition: all 0.15s;
}
.tag-badge:hover { background: var(--accent-color); color: white; }
.tag-badge.active { background: var(--accent-color); color: white; font-weight: 600; }
.tag-empty { font-size: 0.75rem; color: #ccc; padding: 0 4px; }

.notes-feed { display: flex; flex-direction: column; gap: 16px; margin-top: 24px; }
.note-card {
  background: var(--bg-card); 
  border-radius: var(--radius-lg); 
  padding: 24px;
  border: 1px solid var(--border-color);
  transition: border-color 0.2s;
}
.note-card.pinned { border-left: 3px solid var(--accent-color); }

.note-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 12px; font-size: 0.8rem; color: var(--text-secondary);
}
.note-date { font-family: var(--font-sans); font-size: 0.8rem; }

/* Note Actions */
.note-actions { display: flex; gap: 4px; opacity: 0; transition: opacity 0.2s; }
.note-card:hover .note-actions { opacity: 1; }
.btn-action { 
  background: none; border: none; color: #a1a1aa; cursor: pointer; 
  padding: 4px; border-radius: 4px; display: flex; align-items: center;
  transition: all 0.15s;
}
.btn-action:hover { color: var(--text-primary); background: #f4f4f5; }
.pin-active { color: var(--accent-color) !important; }

/* Note Tags */
.note-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.note-tag { 
  font-size: 0.75rem; color: var(--accent-color); cursor: pointer;
  transition: opacity 0.15s;
}
.note-tag:hover { opacity: 0.7; }

/* Edit Area */
.edit-area { margin-top: 8px; }
.edit-input { 
  width: 100%; min-height: 100px; border: 1px solid var(--border-color); 
  border-radius: var(--radius-md); padding: 12px; font-size: 0.95rem; 
  font-family: var(--font-mono); resize: vertical; outline: none;
  transition: border-color 0.2s;
}
.edit-input:focus { border-color: var(--accent-color); }
.edit-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
.btn-save { 
  background: var(--accent-color); color: white; border: none; 
  padding: 6px 16px; border-radius: var(--radius-md); cursor: pointer;
  font-size: 0.85rem; font-weight: 500;
}
.btn-save:hover { background: var(--accent-hover); }
.btn-cancel { 
  background: #e4e4e7; color: var(--text-primary); border: none; 
  padding: 6px 16px; border-radius: var(--radius-md); cursor: pointer;
  font-size: 0.85rem;
}
.btn-cancel:hover { background: #d4d4d8; }

/* Markdown Body styling */
.markdown-body { font-size: 1rem; color: #333; line-height: 1.6; word-wrap: break-word;}
.markdown-body h1, .markdown-body h2, .markdown-body h3 { 
  font-size: 1.1rem; margin-top: 0.5em; margin-bottom: 8px; color: #222; font-weight: 500;
}
.markdown-body p { margin-bottom: 12px; }
.markdown-body p:last-child { margin-bottom: 0; }
.markdown-body ul, .markdown-body ol { margin-left: 20px; margin-bottom: 12px; }
.markdown-body li { margin-bottom: 2px; }
.markdown-body img { max-width: 100%; border-radius: var(--radius-md); margin: 8px 0; }
.markdown-body pre { background: var(--bg-main); padding: 12px; border-radius: var(--radius-md); overflow-x: auto; margin-bottom: 12px; font-size: 0.9rem;}
.markdown-body code { font-family: var(--font-mono); background: var(--bg-main); padding: 2px 6px; border-radius: 4px; font-size: 0.85em; }
.markdown-body pre code { background: transparent; padding: 0; color: inherit; }

/* Sync Status */
.sync-status {
  font-size: 0.8rem;
  color: #fbbf24;
  background-color: #fef3c7;
  padding: 4px 10px;
  border-radius: 12px;
  font-weight: 500;
  white-space: nowrap;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .app-container {
    flex-direction: column;
    max-width: 100%;
    margin: 0;
    height: 100vh;
  }
  
  .sidebar {
    width: 100%;
    position: static;
    height: auto;
    padding: 16px;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }

  .main-content {
    padding-left: 0;
    padding: 16px;
  }

  .topbar {
    padding: 16px 0;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .search-box {
    width: 100%;
  }

  .heatmap {
    overflow-x: auto;
  }
}
</style>
