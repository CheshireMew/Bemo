<template>
  <div class="mobile-composer-shell">
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
.mobile-composer-shell {
  position: static;
  z-index: 1;
  padding-bottom: 0;
  background: var(--bg-main);
}
</style>
