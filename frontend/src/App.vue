<template>
  <component :is="shellComponent" />
  <AppDialogHost />
</template>

<script setup lang="ts">
import { computed } from 'vue';

import './styles/base.css';
import './styles/markdown.css';

import MobileAppShell from './components/shells/MobileAppShell.vue';
import WebDesktopAppShell from './components/shells/WebDesktopAppShell.vue';
import AppDialogHost from './components/AppDialogHost.vue';
import { getProductShell } from './domain/runtime/shellRuntime';

const shellComponent = computed(() => (
  getProductShell() === 'mobile'
    ? MobileAppShell
    : WebDesktopAppShell
));
</script>
