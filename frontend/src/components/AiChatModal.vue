<template>
  <SharedAiChatModalCore :shell="shell" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SharedAiChatModalCore from './ai/SharedAiChatModalCore.vue';
import { getProductShell } from '../domain/runtime/shellRuntime';

const shell = computed(() => (
  getProductShell() === 'mobile'
    ? 'mobile'
    : 'web-desktop'
));
</script>
