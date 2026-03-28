<template>
  <div class="note-card mobile-note-card" :class="{ pinned: note.pinned }">
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
          <button class="btn-action" :title="actionsOpen ? '收起操作' : '更多操作'" @click="actionsOpen = !actionsOpen">
            <MoreHorizontal :size="16" />
          </button>
        </template>
      </div>
    </div>

    <div v-if="!isTrash && actionsOpen && !isEditing" class="action-sheet">
      <button class="action-chip" type="button" @click="openNoteAiChat">
        <Bot :size="14" />
        <span>AI</span>
      </button>
      <button class="action-chip" :class="{ copied: copyFeedback }" type="button" @click="copyNoteContent">
        <Copy :size="14" />
        <span>{{ copyActionLabel }}</span>
      </button>
      <button class="action-chip" type="button" @click="togglePin(note)">
        <Pin :size="14" :class="{ 'pin-active': note.pinned }" />
        <span>{{ note.pinned ? '取消置顶' : '置顶' }}</span>
      </button>
      <button class="action-chip action-chip-danger" type="button" @click="removeNote">
        <Trash2 :size="14" />
        <span>删除</span>
      </button>
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
      @saved="actionsOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import { Bot, Copy, MoreHorizontal, Pencil, Pin, RotateCcw, Trash2 } from 'lucide-vue-next';
import SharedNoteCardBody from '../../MainFeed/note-card/SharedNoteCardBody.vue';
import MobileNoteEditSheet from './MobileNoteEditSheet.vue';
import type { NoteMeta } from '../../../store/notes';
import { deleteNote, togglePin } from '../../../store/notes';
import { useMobileBackHandler } from '../../../composables/useMobileBackHandler';
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

const actionsOpen = ref(false);
const isEditSheetOpen = computed(() => mobileEditingNoteId.value === props.note.note_id);
const noop = () => {};

const {
  isEditing,
  renderedHtml,
  resolvedImageUrls,
  resolvedAttachmentUrls,
  copyFeedback,
  copyActionLabel,
  imageAttachments,
  audioAttachments,
  videoAttachments,
  fileAttachments,
  openNoteAiChat,
  copyNoteContent,
  openImagePreview,
  openFileAttachment,
} = useNoteCard(toRef(props, 'note'));

watch(isEditing, (editing) => {
  if (editing) {
    actionsOpen.value = false;
  }
});

useMobileBackHandler({
  id: `mobile-note-actions:${props.note.note_id}`,
  priority: 620,
  enabled: computed(() => Boolean(actionsOpen.value && !props.isTrash && !isEditSheetOpen.value)),
  dismiss: () => {
    actionsOpen.value = false;
  },
});

const startEdit = () => {
  actionsOpen.value = false;
  openMobileNoteEditor(props.note.note_id);
};

const removeNote = async () => {
  actionsOpen.value = false;
  await deleteNote(props.note);
};
</script>

<style scoped>
.note-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  transition: border-color 0.2s;
}

.note-card.pinned {
  border-left: 3px solid var(--accent-color);
}

.note-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.note-date {
  font-family: var(--font-sans);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.76rem;
}

.note-date-pin {
  color: var(--accent-color);
  flex-shrink: 0;
}

.note-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
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

.action-sheet {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0 0 12px;
}

.action-chip {
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: 12px;
  background: var(--bg-main, #f8fafc);
  color: var(--text-primary);
  padding: 10px 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
}

.action-chip-danger {
  color: #b91c1c;
}

.action-chip.copied {
  color: var(--accent-color, #31d279);
  border-color: color-mix(in srgb, var(--accent-color, #31d279) 45%, var(--border-color, #e4e4e7));
  background: color-mix(in srgb, var(--accent-color, #31d279) 12%, var(--bg-main, #f8fafc));
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
