import { onBeforeUnmount, onMounted } from 'vue';

import { installMobileBackHandler } from '../domain/runtime/mobileBackNavigation.js';
import { installMobileKeyboardInsetBridge } from '../domain/runtime/mobileKeyboardInsets.js';
import { fetchNotes } from '../store/notes';
import { initSync } from '../store/sync';
import { initTheme } from '../store/ui';
import { initSettings } from '../services/localSettings';

let settingsInitialized = false;

function ensureSettingsInitialized() {
  if (settingsInitialized) {
    return;
  }
  initSettings();
  settingsInitialized = true;
}

export function useAppBootstrap() {
  ensureSettingsInitialized();
  let stopSync: (() => void) | undefined;

  onMounted(() => {
    installMobileBackHandler();
    installMobileKeyboardInsetBridge();
    initTheme();
    stopSync = initSync(() => {
      void fetchNotes();
    });
    fetchNotes();
  });
  onBeforeUnmount(() => stopSync?.());

  const onNotesImported = () => {
    void fetchNotes();
  };

  return {
    onNotesImported,
  };
}
