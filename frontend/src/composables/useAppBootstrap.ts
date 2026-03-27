import { onMounted } from 'vue';

import { loadAiSettings } from '../domain/ai/localAiSettings';
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

  onMounted(() => {
    installMobileBackHandler();
    installMobileKeyboardInsetBridge();
    initTheme();
    initSync(() => {
      fetchNotes();
    });
    fetchNotes();
    loadAiSettings().catch((error) => {
      console.error('Failed to load AI settings.', error);
    });
  });

  const onNoteSaved = () => {
    fetchNotes();
  };

  return {
    onNoteSaved,
  };
}
