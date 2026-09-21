<template>
  <div class="note-card web-desktop-note-card" :class="{ pinned: note.pinned }" :aria-busy="pendingNoteIds.has(note.note_id)">
    <div class="note-header">
      <span class="note-date">
        <Pin v-if="note.pinned" class="note-date-pin" :size="13" />
        {{ formatNoteDate(note.created_at) }}
      </span>
      <div class="note-actions" :inert="pendingNoteIds.has(note.note_id)">
        <template v-if="isTrash">
          <button class="btn-action btn-restore" type="button" title="恢复" aria-label="恢复笔记" @click="emit('restore')"><RotateCcw :size="16" /></button>
          <button class="btn-action" type="button" title="永久删除" aria-label="永久删除笔记" @click="emit('permanentDelete')"><Trash2 :size="16" /></button>
        </template>
        <template v-else>
          <button class="btn-action" type="button" title="编辑" aria-label="编辑笔记" @click="startEdit"><Pencil :size="16" /></button>
          <button class="btn-action" type="button" :class="{ copied: copyFeedback }" :title="copyButtonTitle" :aria-label="copyButtonTitle" @click="copyNoteContent"><Copy :size="16" /></button>
          <button class="btn-action" type="button" :title="note.pinned ? '取消置顶' : '置顶'" :aria-label="note.pinned ? '取消置顶' : '置顶笔记'" @click="togglePin(note)"><Pin :size="16" :class="{ 'pin-active': note.pinned }" /></button>
          <button class="btn-action" type="button" title="移到回收站" aria-label="将笔记移到回收站" @click="deleteNote(note)"><Trash2 :size="16" /></button>
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
import { toRef, watch } from 'vue';
import { Copy, Pencil, Pin, RotateCcw, Trash2 } from 'lucide-vue-next';
import SharedNoteCardBody from '../../MainFeed/note-card/SharedNoteCardBody.vue';
import type { NoteMeta } from '../../../store/notes';
import { deleteNote, pendingNoteIds, togglePin } from '../../../store/notes';
import { formatNoteDate, useNoteCard } from '../../../composables/useNoteCard';

const props = defineProps<{
  note: NoteMeta;
  isTrash?: boolean;
}>();

const emit = defineEmits<{
  restore: [];
  permanentDelete: [];
  editingChange: [editing: boolean];
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
  startEdit,
  cancelEdit,
  handleEditSaved,
  copyNoteContent,
  openImagePreview,
  openFileAttachment,
} = useNoteCard(toRef(props, 'note'));
watch(isEditing, editing => emit('editingChange', editing));
</script>

<style scoped>
.note-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 12px 16px;
  border: 1px solid var(--border-color);
  transition: border-color 0.2s;
}

.note-card.pinned {
  border-left: 3px solid var(--accent-color);
}

.note-header {
  gap: 8px;
  flex-wrap: wrap;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-size: var(--font-size-small);
  font-weight: 400;
  color: var(--text-secondary);
}

.note-date {
  font-family: var(--font-sans);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.note-date-pin {
  color: var(--accent-text);
  flex-shrink: 0;
}

.note-actions {
  display: flex;
  gap: 4px;
  opacity: 1;
  transition: opacity 0.2s;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.note-card:hover .note-actions,
.note-card:focus-within .note-actions {
  opacity: 1;
}

@media (hover: none) {
  .note-actions { opacity: 1; }
}

.btn-action {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.btn-action:hover {
  color: var(--text-primary);
  background: #f4f4f5;
}

.btn-action.copied {
  color: var(--accent-text);
  background: color-mix(in srgb, var(--accent-color) 12%, transparent);
}

.pin-active {
  color: var(--accent-text) !important;
}

:root.dark .btn-action:hover {
  background: #3f3f46;
}

.note-actions .btn-restore {
  color: var(--accent-text) !important;
}
</style>
