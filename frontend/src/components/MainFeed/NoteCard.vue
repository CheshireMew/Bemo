<template>
  <component
    :is="noteCardComponent"
    :note="note"
    :isTrash="isTrash"
    @restore="emit('restore')"
    @permanentDelete="emit('permanentDelete')"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { NoteMeta } from '../../store/notes';
import { getProductShell } from '../../domain/runtime/shellRuntime';
import MobileNoteCard from '../shells/mobile/MobileNoteCard.vue';
import WebDesktopNoteCard from '../shells/web-desktop/WebDesktopNoteCard.vue';

defineProps<{
  note: NoteMeta;
  isTrash?: boolean;
}>();

const emit = defineEmits<{
  restore: [];
  permanentDelete: [];
}>();

const noteCardComponent = computed(() => (
  getProductShell() === 'mobile'
    ? MobileNoteCard
    : WebDesktopNoteCard
));
</script>
