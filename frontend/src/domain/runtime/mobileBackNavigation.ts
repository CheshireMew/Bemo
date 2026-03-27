import {
  searchQuery,
  searchResults,
  selectedDate,
  selectedTag,
  clearSearch,
  clearSelectedFilters,
} from '../../store/notes';
import {
  closeAiChat,
  closeImagePreview,
  closeMobileCompose,
  closeMobileNoteEditor,
  closeMobileSettings,
  closeSidebar,
  currentView,
  isAiChatOpen,
  isImagePreviewOpen,
  isMobileComposeOpen,
  isMobileSettingsOpen,
  isSidebarOpen,
  mobileEditingNoteId,
  setView,
} from '../../store/ui';
import { performDefaultNativeBackNavigation } from './nativePlatformBridge.js';
import { isAndroidNativePlatform, isMobileProductShell } from './platformCapabilities.js';

const MOBILE_BACK_EVENT = 'bemoBackButton';

let isInstalled = false;

type MobileBackHandler = {
  id: string;
  priority: number;
  canHandle: () => boolean;
  handle: () => void;
};

const extraMobileBackHandlers = new Map<string, MobileBackHandler>();

const builtinMobileBackHandlers: MobileBackHandler[] = [
  {
    id: 'mobile-note-editor',
    priority: 500,
    canHandle: () => Boolean(mobileEditingNoteId.value),
    handle: () => {
      closeMobileNoteEditor();
    },
  },
  {
    id: 'mobile-compose',
    priority: 460,
    canHandle: () => isMobileComposeOpen.value,
    handle: () => {
      closeMobileCompose();
    },
  },
  {
    id: 'mobile-settings',
    priority: 420,
    canHandle: () => isMobileSettingsOpen.value,
    handle: () => {
      closeMobileSettings();
    },
  },
  {
    id: 'image-preview',
    priority: 380,
    canHandle: () => isImagePreviewOpen.value,
    handle: () => {
      closeImagePreview();
    },
  },
  {
    id: 'ai-chat',
    priority: 340,
    canHandle: () => isAiChatOpen.value,
    handle: () => {
      closeAiChat();
    },
  },
  {
    id: 'sidebar',
    priority: 300,
    canHandle: () => isSidebarOpen.value,
    handle: () => {
      closeSidebar();
    },
  },
  {
    id: 'search',
    priority: 220,
    canHandle: () => Boolean(searchQuery.value.trim() || searchResults.value !== null),
    handle: () => {
      clearSearch();
    },
  },
  {
    id: 'view',
    priority: 180,
    canHandle: () => currentView.value !== 'all',
    handle: () => {
      setView('all');
    },
  },
  {
    id: 'filters',
    priority: 140,
    canHandle: () => Boolean(selectedDate.value || selectedTag.value),
    handle: () => {
      clearSelectedFilters();
    },
  },
];

function getOrderedMobileBackHandlers() {
  return [
    ...builtinMobileBackHandlers,
    ...Array.from(extraMobileBackHandlers.values()),
  ].sort((left, right) => right.priority - left.priority);
}

export function registerMobileBackHandler(input: MobileBackHandler) {
  extraMobileBackHandlers.set(input.id, input);
  return () => {
    const current = extraMobileBackHandlers.get(input.id);
    if (current === input) {
      extraMobileBackHandlers.delete(input.id);
    }
  };
}

export function dismissTopMobileSurface() {
  for (const handler of getOrderedMobileBackHandlers()) {
    if (!handler.canHandle()) {
      continue;
    }
    handler.handle();
    return true;
  }

  return false;
}

async function handleMobileBackButton() {
  if (dismissTopMobileSurface()) {
    return;
  }

  try {
    await performDefaultNativeBackNavigation();
  } catch (error) {
    console.error('Failed to perform native back navigation.', error);
  }
}

export function installMobileBackHandler() {
  if (isInstalled || typeof window === 'undefined') {
    return;
  }

  if (!isMobileProductShell() || !isAndroidNativePlatform()) {
    return;
  }

  isInstalled = true;
  window.addEventListener(MOBILE_BACK_EVENT, handleMobileBackButton as EventListener);
}
