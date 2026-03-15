<template>
  <div class="note-card" :class="{ pinned: note.pinned }">
    <div class="note-header">
      <span class="note-date">{{ note.pinned ? '📌 ' : '' }}{{ formatDate(note.created_at) }}</span>
      <div class="note-actions">
        <!-- Trash state only has Restore/Permanent Delete -->
        <template v-if="isTrash">
          <button class="btn-action btn-restore" title="恢复" @click="$emit('restore')"><RotateCcw :size="14" /></button>
          <button class="btn-action" title="永久删除" @click="$emit('permanentDelete')"><Trash2 :size="14" /></button>
        </template>
        <!-- Normal state -->
        <template v-else-if="!isRandom">
          <button class="btn-action" title="编辑" @click="startEdit"><Pencil :size="14" /></button>
          <button class="btn-action" :title="note.pinned ? '取消置顶' : '置顶'" @click="togglePin(note)"><Pin :size="14" :class="{ 'pin-active': note.pinned }" /></button>
          <button class="btn-action" title="删除" @click="deleteNote(note.filename)"><Trash2 :size="14" /></button>
        </template>
      </div>
    </div>
    
    <!-- Tags -->
    <div v-if="note.tags && note.tags.length" class="note-tags">
      <span v-for="t in note.tags" :key="t" class="note-tag" @click="isTrash || isRandom ? null : toggleTag(t)">#{{ t }}</span>
    </div>
    
    <!-- Edit Mode -->
    <div v-if="isEditing" class="edit-area">
      <textarea v-model="editContent" class="edit-input"></textarea>
      <div class="edit-actions">
        <button class="btn-save" @click="saveEdit">保存</button>
        <button class="btn-cancel" @click="cancelEdit">取消</button>
      </div>
    </div>
    
    <!-- View Mode -->
    <div v-else class="note-body markdown-body" v-html="renderMarkdown(note.content)"></div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';
import { marked } from 'marked';
import { API_BASE } from '../../config';
import { Pencil, Pin, Trash2, RotateCcw } from 'lucide-vue-next';
import type { NoteMeta } from '../../store/notes';
import { togglePin, deleteNote, toggleTag, fetchNotes } from '../../store/notes';

marked.use({ gfm: true, breaks: true });

const props = defineProps<{
  note: NoteMeta;
  isTrash?: boolean;
  isRandom?: boolean;
}>();

defineEmits(['restore', 'permanentDelete']);

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

const isEditing = ref(false);
const editContent = ref('');

const startEdit = () => {
  isEditing.value = true;
  editContent.value = props.note.content;
};

const cancelEdit = () => {
  isEditing.value = false;
  editContent.value = '';
};

const saveEdit = async () => {
  try {
    await axios.put(`${API_BASE}/notes/${props.note.filename}`, { content: editContent.value });
    isEditing.value = false;
    editContent.value = '';
    await fetchNotes(); // 全局刷新笔记列表
  } catch (e) {
    console.error(e);
    alert('保存失败');
  }
};
</script>

<style scoped>
.note-card {
  background: var(--bg-card); 
  border-radius: var(--radius-lg); 
  padding: 24px;
  border: 1px solid var(--border-color);
  transition: border-color 0.2s;
  margin-bottom: 16px;
}
.note-card.pinned { border-left: 3px solid var(--accent-color); }

.note-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 12px; font-size: 0.8rem; color: var(--text-secondary);
}
.note-date { font-family: var(--font-sans); }

.note-actions { display: flex; gap: 4px; opacity: 0; transition: opacity 0.2s; }
.note-card:hover .note-actions { opacity: 1; }
.btn-action { 
  background: none; border: none; color: #a1a1aa; cursor: pointer; 
  padding: 4px; border-radius: 4px; display: flex; align-items: center;
  transition: all 0.15s;
}
.btn-action:hover { color: var(--text-primary); background: #f4f4f5; }
.pin-active { color: var(--accent-color) !important; }

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
  scrollbar-width: none; -ms-overflow-style: none;
  background: transparent;
  color: var(--text-primary);
}
.edit-input::-webkit-scrollbar { display: none; }
.edit-input:focus { border-color: var(--accent-color); }
.edit-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
.btn-save { 
  background: var(--accent-color); color: white; border: none; 
  padding: 6px 16px; border-radius: var(--radius-md); cursor: pointer;
  font-size: 0.85rem; font-weight: 500;
}
.btn-save:hover { background: var(--accent-hover); }
.btn-cancel { 
  background: #e4e4e7; color: #3f3f46; border: none; 
  padding: 6px 16px; border-radius: var(--radius-md); cursor: pointer;
  font-size: 0.85rem;
}
.btn-cancel:hover { background: #d4d4d8; }

:root.dark .btn-cancel { background: #3f3f46; color: #f4f4f5; }
:root.dark .btn-cancel:hover { background: #52525b; }
:root.dark .btn-action:hover { background: #3f3f46; }

/* 强行针对 trash 状态始终显示操作可以补充 */
.note-actions .btn-restore { color: var(--accent-color) !important; }
</style>
