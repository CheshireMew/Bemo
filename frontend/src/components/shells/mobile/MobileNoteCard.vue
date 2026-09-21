<template>
  <div
    class="note-card mobile-note-card"
    :class="{ pinned: note.pinned }"
  >
    <div class="note-header">
      <span class="note-date">
        <Pin v-if="note.pinned" class="note-date-pin" :size="13" />
        {{ formatNoteDate(note.created_at) }}
      </span>
      <div class="note-actions">
        <template v-if="isTrash">
          <button class="btn-action btn-restore" type="button" title="恢复" aria-label="恢复笔记" @click="emit('restore')"><RotateCcw :size="16" /></button>
          <button class="btn-action" type="button" title="永久删除" aria-label="永久删除笔记" @click="emit('permanentDelete')"><Trash2 :size="16" /></button>
        </template>
        <template v-else>
          <button class="btn-action" type="button" title="编辑" aria-label="编辑笔记" @click="startEdit"><Pencil :size="17" /></button>
          <button class="btn-action" type="button" :class="{ copied: copyFeedback }" :title="copyButtonTitle" :aria-label="copyButtonTitle" @click="copyNoteContent"><Copy :size="17" /></button>
          <button class="btn-action" type="button" :title="note.pinned ? '取消置顶' : '置顶'" :aria-label="note.pinned ? '取消置顶' : '置顶笔记'" @click="togglePin(note)"><Pin :size="17" :class="{ 'pin-active': note.pinned }" /></button>
          <button class="btn-action" type="button" title="移到回收站" aria-label="将笔记移到回收站" @click="removeNote"><Trash2 :size="17" /></button>
        </template>
      </div>
    </div>

    <SharedNoteCardBody
      :note="note"
      :isTrash="isTrash"
      :isEditing="false"
      :renderedHtml="renderedHtml"
      :imageAttachments="imageAttachments"
      :audioAttachments="audioAttachments"
      :videoAttachments="videoAttachments"
      :fileAttachments="fileAttachments"
      :resolvedImageUrls="resolvedImageUrls"
      :resolvedAttachmentUrls="resolvedAttachmentUrls"
      :cancelEdit="noop"
      :handleEditSaved="noop"
      :openImagePreview="openImagePreview"
      :openFileAttachment="openFileAttachment"
    />

    <MobileNoteEditSheet
      :open="isEditSheetOpen"
      :note="note"
      @close="closeMobileNoteEditor"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue';
import { Copy, Pencil, Pin, RotateCcw, Trash2 } from 'lucide-vue-next';
import SharedNoteCardBody from '../../MainFeed/note-card/SharedNoteCardBody.vue';
import MobileNoteEditSheet from './MobileNoteEditSheet.vue';
import type { NoteMeta } from '../../../store/notes';
import { deleteNote, togglePin } from '../../../store/notes';
import { formatNoteDate, useNoteCard } from '../../../composables/useNoteCard';
import { closeMobileNoteEditor, mobileEditingNoteId, openMobileNoteEditor } from '../../../store/ui';

const props = defineProps<{
  note: NoteMeta;
  isTrash?: boolean;
}>();

const emit = defineEmits<{
  restore: [];
  permanentDelete: [];
}>();

const isEditSheetOpen = computed(() => mobileEditingNoteId.value === props.note.note_id);
const noop = () => {};

const {
  renderedHtml,
  resolvedImageUrls,
  resolvedAttachmentUrls,
  copyFeedback,
  copyButtonTitle,
  imageAttachments,
  audioAttachments,
  videoAttachments,
  fileAttachments,
  copyNoteContent,
  openImagePreview,
  openFileAttachment,
} = useNoteCard(toRef(props, 'note'));

const startEdit = () => {
  openMobileNoteEditor(props.note.note_id);
};

const removeNote = async () => {
  await deleteNote(props.note);
};
</script>

<style scoped>
.note-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  transition: border-color 0.2s;
}

.note-card.pinned {
  border-left: 3px solid var(--accent-color);
}

.note-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
  font-size: var(--font-size-small);
  font-weight: 400;
  color: var(--text-secondary);
}

.note-date {
  font-family: var(--font-sans);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-caption);
  font-weight: 400;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-date-pin {
  color: var(--accent-text);
  flex-shrink: 0;
}

.note-actions {
  display: flex;
  gap: 0;
  justify-content: flex-end;
  flex-shrink: 0;
}

.btn-action {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  width: 38px;
  height: 38px;
  min-width: 38px !important;
  min-height: 38px !important;
  padding: 0;
  border-radius: 12px;
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
  color: var(--accent-text, #31d279);
  background: color-mix(in srgb, var(--accent-color, #31d279) 12%, transparent);
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
