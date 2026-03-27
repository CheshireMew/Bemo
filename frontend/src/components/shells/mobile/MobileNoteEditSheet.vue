<template>
  <MobileEditorSheet
    v-if="note"
    :open="open"
    title="编辑笔记"
    :subtitle="note.title || '调整内容、标签和附件'"
    :draft-key="`note-mobile:${note.note_id}`"
    :initial-content="note.content"
    :initial-tags="note.tags"
    :show-cancel="true"
    :autosave-draft="false"
    :reset-on-success="false"
    placeholder="修改这条笔记..."
    submit-title="保存"
    :submit-action="saveEdit"
    @close="emit('close')"
    @saved="handleSaved"
  />
</template>

<script setup lang="ts">
import MobileEditorSheet from './MobileEditorSheet.vue';
import type { EditorSubmitPayload } from '../../Editor.vue';
import type { NoteMeta } from '../../../store/notes';
import { updateNoteContent } from '../../../store/notes';
import { pushNotification } from '../../../store/notifications';

const props = defineProps<{
  open: boolean;
  note: NoteMeta | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const saveEdit = async (payload: EditorSubmitPayload) => {
  if (!props.note) return;
  try {
    await updateNoteContent(props.note, payload);
  } catch (e) {
    console.error(e);
    pushNotification('保存失败', 'error');
    throw e;
  }
};

const handleSaved = () => {
  emit('saved');
  emit('close');
};
</script>
