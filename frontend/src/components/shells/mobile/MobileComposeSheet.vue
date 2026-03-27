<template>
  <MobileEditorSheet
    :open="open"
    title="快速记录"
    subtitle="打开后直接输入，不再额外进入新页面。"
    draft-key="compose-mobile"
    :show-cancel="false"
    submit-title="保存"
    @close="emit('close')"
    @saved="emit('saved')"
  />
</template>

<script setup lang="ts">
import MobileEditorSheet from './MobileEditorSheet.vue';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();
</script>
