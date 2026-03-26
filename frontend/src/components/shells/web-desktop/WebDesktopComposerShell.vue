<template>
  <div class="editor-sticky-shell">
    <Editor draft-key="compose" @saved="emit('saved')" />
  </div>
</template>

<script setup lang="ts">
import Editor from '../../Editor.vue';

const emit = defineEmits<{
  saved: [];
}>();
</script>

<style scoped>
.editor-sticky-shell {
  position: relative;
  z-index: 9;
  padding-bottom: 12px;
  background: var(--bg-main);
}

@media (max-width: 767px) {
  .editor-sticky-shell {
    position: static;
    padding-bottom: 0;
  }
}
</style>
