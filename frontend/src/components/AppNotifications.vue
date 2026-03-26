<template>
  <SharedNotificationsCore :shell="shell" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SharedNotificationsCore from './notifications/SharedNotificationsCore.vue';
import { getProductShell } from '../domain/runtime/shellRuntime';

const shell = computed(() => (
  getProductShell() === 'mobile'
    ? 'mobile'
    : 'web-desktop'
));
</script>
