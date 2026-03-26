<template>
  <SharedEditorCore shell="web-desktop" v-bind="props" @saved="emit('saved')" @cancel="emit('cancel')" />
</template>

<script setup lang="ts">
import SharedEditorCore from './SharedEditorCore.vue';
import type { EditorSubmitPayload } from './SharedEditorCore.vue';

const props = withDefaults(defineProps<{
  initialContent?: string;
  initialTags?: string[];
  draftKey?: string;
  placeholder?: string;
  showCancel?: boolean;
  autosaveDraft?: boolean;
  resetOnSuccess?: boolean;
  submitTitle?: string;
  submitAction?: ((payload: EditorSubmitPayload) => Promise<void> | void) | null;
}>(), {
  initialContent: '',
  initialTags: () => [],
  draftKey: 'compose',
  placeholder: '现在的想法是...',
  showCancel: false,
  autosaveDraft: true,
  resetOnSuccess: true,
  submitTitle: '发送',
  submitAction: null,
});

const emit = defineEmits(['saved', 'cancel']);
</script>
