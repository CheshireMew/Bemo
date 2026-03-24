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
          <button class="btn-action" title="删除" @click="deleteNote(note.note_id)"><Trash2 :size="14" /></button>
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
        :draft-key="`note:${note.note_id}`"
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
    <template v-else>
      <div class="note-body markdown-body" v-html="renderedHtml"></div>
      <div v-if="imageAttachments.length" class="note-image-grid">
        <button
          v-for="(image, index) in imageAttachments"
          :key="image.url"
          type="button"
          class="note-image-card"
          :class="{ 'note-image-card-primary': index === 0, 'note-image-card-secondary': index > 0 }"
          @click="openImagePreview(image.url)"
        >
          <img :src="resolvedImageUrls[image.url] || image.url" :alt="image.label" class="note-image" />
        </button>
      </div>
      <div v-if="audioAttachments.length" class="note-audio-list">
        <div
          v-for="audio in audioAttachments"
          :key="audio.url"
          class="note-audio-card"
        >
          <div class="note-audio-title">{{ audio.label }}</div>
          <audio class="note-audio-player" controls :src="resolvedAttachmentUrls[audio.url] || audio.url"></audio>
        </div>
      </div>
      <div v-if="videoAttachments.length" class="note-video-list">
        <div
          v-for="video in videoAttachments"
          :key="video.url"
          class="note-video-card"
        >
          <div class="note-video-title">{{ video.label }}</div>
          <video class="note-video-player" controls :src="resolvedAttachmentUrls[video.url] || video.url"></video>
        </div>
      </div>
      <div v-if="fileAttachments.length" class="note-file-list">
        <a
          v-for="file in fileAttachments"
          :key="file.url"
          class="note-file-card"
          :href="resolvedAttachmentUrls[file.url] || file.url"
          target="_blank"
          rel="noreferrer"
        >
          <span class="note-file-label">{{ file.label }}</span>
        </a>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Pencil, Pin, Trash2, RotateCcw, Copy, Bot } from 'lucide-vue-next';
import Editor, { type EditorSubmitPayload } from '../Editor.vue';
import type { NoteMeta } from '../../store/notes';
import { togglePin, deleteNote, toggleTag, updateNoteContent } from '../../store/notes';
import { pushNotification } from '../../store/notifications';
import { settings } from '../../store/settings';
import { openAiChat } from '../../store/ui';
import { resolveAttachmentUrl } from '../../domain/attachments/attachmentUrlResolver';
import { getEditorAttachmentDisplayKind, splitEditorMarkdownByKind } from '../../utils/editorAttachments';
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

const isEditing = ref(false);
const renderedHtml = ref('');
const resolvedImageUrls = ref<Record<string, string>>({});
const resolvedAttachmentUrls = ref<Record<string, string>>({});
const { isMobile, isTouch } = useViewport();
const copyFeedback = ref(false);
const editDraftStorageKey = computed(() => `bemo.editor.draft:note:${props.note.note_id}`);
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
  localStorage.removeItem(editDraftStorageKey.value);
  isEditing.value = true;
};

const cancelEdit = () => {
  localStorage.removeItem(editDraftStorageKey.value);
  isEditing.value = false;
};

const saveEdit = async (payload: EditorSubmitPayload) => {
  try {
    await updateNoteContent(props.note, payload);
  } catch (e) {
    console.error(e);
    pushNotification('保存失败', 'error');
    throw e;
  }
};

const handleEditSaved = async () => {
  localStorage.removeItem(editDraftStorageKey.value);
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
    pushNotification('复制失败', 'error');
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
const splitContent = computed(() => splitEditorMarkdownByKind(props.note.content || ''));
const imageAttachments = computed(() => splitContent.value.attachments.filter((attachment) => getEditorAttachmentDisplayKind(attachment) === 'image'));
const audioAttachments = computed(() => splitContent.value.attachments.filter((attachment) => getEditorAttachmentDisplayKind(attachment) === 'audio'));
const videoAttachments = computed(() => splitContent.value.attachments.filter((attachment) => getEditorAttachmentDisplayKind(attachment) === 'video'));
const fileAttachments = computed(() => splitContent.value.attachments.filter((attachment) => getEditorAttachmentDisplayKind(attachment) === 'file'));

const openImagePreview = (url: string) => {
  const target = resolvedImageUrls.value[url] || url;
  window.open(target, '_blank', 'noopener,noreferrer');
};

watch(() => props.note.content, async (content) => {
  renderedHtml.value = String(await renderMarkdownToHtml(splitEditorMarkdownByKind(content || '').body));
}, { immediate: true });

watch(imageAttachments, async (nextImages) => {
  const entries = await Promise.all(nextImages.map(async (image) => (
    [image.url, await resolveAttachmentUrl(image.url)] as const
  )));
  resolvedImageUrls.value = Object.fromEntries(entries);
}, { immediate: true });

watch(() => splitContent.value.attachments, async (nextAttachments) => {
  const entries = await Promise.all(nextAttachments.map(async (attachment) => (
    [attachment.url, await resolveAttachmentUrl(attachment.url)] as const
  )));
  resolvedAttachmentUrls.value = Object.fromEntries(entries);
}, { immediate: true });
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
.note-image-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.note-image-card {
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: 14px;
  overflow: hidden;
  background: var(--bg-main, #f4f5f7);
  padding: 0;
  cursor: pointer;
}

.note-image-card-primary {
  grid-column: 1 / -1;
}

.note-image-card-secondary {
  min-width: 0;
}

.note-image {
  display: block;
  width: 100%;
  height: auto;
  max-height: 70vh;
  object-fit: contain;
  background: var(--bg-card, #fff);
}

.note-image-card-primary .note-image {
  max-height: 72vh;
}

.note-image-card-secondary .note-image {
  aspect-ratio: 1 / 1;
  max-height: none;
  object-fit: cover;
}

.note-audio-list,
.note-video-list,
.note-file-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.note-audio-card,
.note-video-card,
.note-file-card {
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: 14px;
  background: var(--bg-main, #f4f5f7);
  padding: 12px;
}

.note-file-card {
  display: flex;
  align-items: center;
  text-decoration: none;
  color: var(--text-primary);
}

.note-audio-title,
.note-video-title,
.note-file-label {
  font-size: 0.84rem;
  font-weight: 600;
  margin-bottom: 8px;
  word-break: break-all;
}

.note-audio-player,
.note-video-player {
  width: 100%;
  display: block;
}

.note-video-player {
  max-height: 320px;
  background: #000;
  border-radius: 10px;
}
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

  .note-image-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .note-image {
    max-height: 50vh;
  }

  .note-image-card-primary .note-image {
    max-height: 52vh;
  }
}
</style>
