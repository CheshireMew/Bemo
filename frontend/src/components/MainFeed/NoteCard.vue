<template>
  <div class="note-card" :class="{ pinned: note.pinned }">
    <div class="note-header">
      <span class="note-date">
        <Pin v-if="note.pinned" class="note-date-pin" :size="13" />
        {{ formatDate(note.created_at) }}
      </span>
      <div class="note-actions">
        <!-- Trash state only has Restore/Permanent Delete -->
        <template v-if="isTrash">
          <button class="btn-action btn-restore" title="恢复" @click="$emit('restore')"><RotateCcw :size="14" /></button>
          <button class="btn-action" title="永久删除" @click="$emit('permanentDelete')"><Trash2 :size="14" /></button>
        </template>
        <!-- Normal state -->
        <template v-else>
          <button class="btn-action" title="编辑" @click="startEdit"><Pencil :size="14" /></button>
          <button class="btn-action" title="与 AI 对话" @click="openNoteAiChat"><Bot :size="14" /></button>
          <button class="btn-action" :title="copyButtonTitle" @click="copyNoteContent"><Copy :size="14" /></button>
          <button class="btn-action" :title="note.pinned ? '取消置顶' : '置顶'" @click="togglePin(note)"><Pin :size="14" :class="{ 'pin-active': note.pinned }" /></button>
          <button class="btn-action" title="删除" @click="deleteNote(note.filename)"><Trash2 :size="14" /></button>
        </template>
      </div>
    </div>
    
    <!-- Tags -->
    <div v-if="note.tags && note.tags.length" class="note-tags">
      <span v-for="t in note.tags" :key="t" class="note-tag" @click="isTrash ? null : toggleTag(t)">#{{ t }}</span>
    </div>

    <!-- Edit Mode -->
    <div v-if="isEditing" class="edit-area">
      <Editor
        :initial-content="note.content"
        :initial-tags="note.tags"
        :show-cancel="true"
        :autosave-draft="false"
        :reset-on-success="false"
        placeholder="修改这条笔记..."
        submit-title="保存"
        :submit-action="saveEdit"
        @cancel="cancelEdit"
        @saved="handleEditSaved"
      />
    </div>
    
    <!-- View Mode -->
    <div v-else class="note-body markdown-body" v-html="renderMarkdown(note.content)"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Pencil, Pin, Trash2, RotateCcw, Copy, Bot } from 'lucide-vue-next';
import Editor, { type EditorSubmitPayload } from '../Editor.vue';
import type { NoteMeta } from '../../store/notes';
import { togglePin, deleteNote, toggleTag, updateNoteContent } from '../../store/notes';
import { settings } from '../../store/settings';
import { openAiChat } from '../../store/ui';
import { renderMarkdownToHtml } from '../../utils/markdownRenderer';
import { useViewport } from '../../composables/useViewport';

const props = defineProps<{
  note: NoteMeta;
  isTrash?: boolean;
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
  return renderMarkdownToHtml(content);
};

const isEditing = ref(false);
const { isMobile, isTouch } = useViewport();
const copyFeedback = ref(false);
const copyButtonTitle = computed(() => {
  if (copyFeedback.value) {
    return '已复制';
  }
  return settings.editor.copyFormat === 'rich-text' ? '复制富文本内容' : '复制 Markdown 内容';
});

const openNoteAiChat = () => {
  const firstLine = (props.note.content || '').trim().split('\n')[0]?.replace(/^#+\s*/, '').trim() || '';
  openAiChat({
    noteId: props.note.note_id,
    noteLabel: firstLine || props.note.title || '当前笔记',
  });
};

const startEdit = () => {
  isEditing.value = true;
};

const cancelEdit = () => {
  isEditing.value = false;
};

const saveEdit = async (payload: EditorSubmitPayload) => {
  try {
    await updateNoteContent(props.note, payload);
  } catch (e) {
    console.error(e);
    alert('保存失败');
    throw e;
  }
};

const handleEditSaved = async () => {
  isEditing.value = false;
};

const copyNoteContent = async () => {
  const markdown = props.note.content || '';

  try {
    if (settings.editor.copyFormat === 'markdown') {
      await navigator.clipboard.writeText(markdown);
      flashCopyFeedback();
      return;
    }

    const html = String(await renderMarkdownToHtml(markdown));
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const plainText = temp.innerText || temp.textContent || markdown;

    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
    } else {
      await navigator.clipboard.writeText(plainText);
    }

    flashCopyFeedback();
  } catch (error) {
    console.error('Failed to copy note content:', error);
    alert('复制失败');
  }
};

let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
const flashCopyFeedback = () => {
  copyFeedback.value = true;
  if (copyFeedbackTimer) {
    clearTimeout(copyFeedbackTimer);
  }
  copyFeedbackTimer = setTimeout(() => {
    copyFeedback.value = false;
  }, 1200);
};

const alwaysShowActions = computed(() => isMobile.value || isTouch.value);
const actionsOpacity = computed(() => (alwaysShowActions.value ? 1 : 0));
</script>

<style scoped>
.note-card {
  background: var(--bg-card); 
  border-radius: var(--radius-lg); 
  padding: 18px 24px;
  border: 1px solid var(--border-color);
  transition: border-color 0.2s;
}
.note-card.pinned { border-left: 3px solid var(--accent-color); }

.note-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 10px; font-size: 0.8rem; color: var(--text-secondary);
}
.note-date {
  font-family: var(--font-sans);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.note-date-pin {
  color: var(--accent-color);
  flex-shrink: 0;
}

.note-actions { display: flex; gap: 4px; opacity: v-bind(actionsOpacity); transition: opacity 0.2s; flex-wrap: wrap; justify-content: flex-end; }
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
.edit-area {
  margin-top: 4px;
}

:root.dark .btn-action:hover { background: #3f3f46; }

/* 强行针对 trash 状态始终显示操作可以补充 */
.note-actions .btn-restore { color: var(--accent-color) !important; }

@media (max-width: 767px) {
  .note-card {
    padding: 14px 16px;
  }

  .note-header {
    align-items: flex-start;
    gap: 10px;
  }

  .note-date {
    font-size: 0.76rem;
  }

  .note-actions {
    max-width: 50%;
  }

  .note-tags {
    gap: 5px;
    margin-bottom: 8px;
  }

  .note-tag {
    font-size: 0.72rem;
  }
}
</style>
