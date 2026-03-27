<template>
  <component ref="editorRef" :is="editorComponent" v-bind="props" @saved="emit('saved')" @cancel="emit('cancel')" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import MobileEditor from './editor/MobileEditor.vue';
import WebDesktopEditor from './editor/WebDesktopEditor.vue';
import { getProductShell } from '../domain/runtime/shellRuntime';
import type { EditorSubmitPayload } from './editor/SharedEditorCore.vue';

export type { EditorSubmitPayload } from './editor/SharedEditorCore.vue';

const props = withDefaults(defineProps<{
  initialContent?: string;
  initialTags?: string[];
  draftKey?: string;
  placeholder?: string;
  showCancel?: boolean;
  autosaveDraft?: boolean;
  resetOnSuccess?: boolean;
  autoFocus?: boolean;
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
  autoFocus: false,
  submitTitle: '发送',
  submitAction: null,
});

const emit = defineEmits(['saved', 'cancel']);
const editorRef = ref<{ focusEditor?: () => void } | null>(null);

const editorComponent = computed(() => (
  getProductShell() === 'mobile'
    ? MobileEditor
    : WebDesktopEditor
));

defineExpose({
  focusEditor: () => editorRef.value?.focusEditor?.(),
});
</script>
