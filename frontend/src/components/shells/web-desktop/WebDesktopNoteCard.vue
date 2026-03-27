<template>
  <div class="note-card web-desktop-note-card" :class="{ pinned: note.pinned }">
    <div class="note-header">
      <span class="note-date">
        <Pin v-if="note.pinned" class="note-date-pin" :size="13" />
        {{ formatNoteDate(note.created_at) }}
      </span>
      <div class="note-actions">
        <template v-if="isTrash">
          <button class="btn-action btn-restore" title="恢复" @click="emit('restore')"><RotateCcw :size="14" /></button>
          <button class="btn-action" title="永久删除" @click="emit('permanentDelete')"><Trash2 :size="14" /></button>
        </template>
        <template v-else>
          <button class="btn-action" title="编辑" @click="startEdit"><Pencil :size="14" /></button>
          <button class="btn-action" title="与 AI 对话" @click="openNoteAiChat"><Bot :size="14" /></button>
          <button class="btn-action" :class="{ copied: copyFeedback }" :title="copyButtonTitle" :aria-label="copyButtonTitle" @click="copyNoteContent"><Copy :size="14" /></button>
          <button class="btn-action" :title="note.pinned ? '取消置顶' : '置顶'" @click="togglePin(note)"><Pin :size="14" :class="{ 'pin-active': note.pinned }" /></button>
          <button class="btn-action" title="删除" @click="deleteNote(note.note_id)"><Trash2 :size="14" /></button>
        </template>
      </div>
    </div>

    <SharedNoteCardBody
      :note="note"
      :isTrash="isTrash"
      :isEditing="isEditing"
      :renderedHtml="renderedHtml"
      :imageAttachments="imageAttachments"
      :audioAttachments="audioAttachments"
      :videoAttachments="videoAttachments"
      :fileAttachments="fileAttachments"
      :resolvedImageUrls="resolvedImageUrls"
      :resolvedAttachmentUrls="resolvedAttachmentUrls"
      :cancelEdit="cancelEdit"
      :handleEditSaved="handleEditSaved"
      :openImagePreview="openImagePreview"
      :openFileAttachment="openFileAttachment"
    />
  </div>
</template>

<script setup lang="ts">
import { toRef } from 'vue';
import { Bot, Copy, Pencil, Pin, RotateCcw, Trash2 } from 'lucide-vue-next';
import SharedNoteCardBody from '../../MainFeed/note-card/SharedNoteCardBody.vue';
import type { NoteMeta } from '../../../store/notes';
import { deleteNote, togglePin } from '../../../store/notes';
import { formatNoteDate, useNoteCard } from '../../../composables/useNoteCard';

const props = defineProps<{
  note: NoteMeta;
  isTrash?: boolean;
}>();

const emit = defineEmits<{
  restore: [];
  permanentDelete: [];
}>();

const {
  isEditing,
  renderedHtml,
  resolvedImageUrls,
  resolvedAttachmentUrls,
  copyFeedback,
  copyButtonTitle,
  imageAttachments,
  audioAttachments,
  videoAttachments,
  fileAttachments,
  openNoteAiChat,
  startEdit,
  cancelEdit,
  handleEditSaved,
  copyNoteContent,
  openImagePreview,
  openFileAttachment,
} = useNoteCard(toRef(props, 'note'));
</script>

<style scoped>
.note-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 18px 24px;
  border: 1px solid var(--border-color);
  transition: border-color 0.2s;
}

.note-card.pinned {
  border-left: 3px solid var(--accent-color);
}

.note-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 0.8rem;
  color: var(--text-secondary);
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

.note-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.note-card:hover .note-actions {
  opacity: 1;
}

.btn-action {
  background: none;
  border: none;
  color: #a1a1aa;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: all 0.15s;
}

.btn-action:hover {
  color: var(--text-primary);
  background: #f4f4f5;
}

.btn-action.copied {
  color: var(--accent-color);
  background: color-mix(in srgb, var(--accent-color) 12%, transparent);
}

.pin-active {
  color: var(--accent-color) !important;
}

:root.dark .btn-action:hover {
  background: #3f3f46;
}

.note-actions .btn-restore {
  color: var(--accent-color) !important;
}
</style>
