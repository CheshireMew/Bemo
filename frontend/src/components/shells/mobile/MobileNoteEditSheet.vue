<template>
  <MobileEditorSheet
    v-if="note"
    :open="open"
    title="编辑笔记"
    :subtitle="note.title || '调整内容、标签和附件'"
    :draft-key="`note-mobile:${note.note_id}`"
    :initial-content="editBase?.content ?? note.content"
    :initial-tags="editBase?.tags ?? note.tags"
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
import { useNoteEditSession } from '../../../composables/useNoteEditSession';

const props = defineProps<{
  open: boolean;
  note: NoteMeta | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const editBase = useNoteEditSession(() => props.open, () => props.note);
const saveEdit = async (payload: EditorSubmitPayload) => {
  if (!editBase.value) throw new Error('编辑会话已关闭，请重新打开笔记。');
  await updateNoteContent(editBase.value, payload);
};

const handleSaved = () => {
  emit('saved');
  emit('close');
};
</script>
