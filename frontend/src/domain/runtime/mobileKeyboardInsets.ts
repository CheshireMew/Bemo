import { ref } from 'vue';

import { isAndroidNativePlatform, isMobileProductShell } from './platformCapabilities.js';

const MOBILE_KEYBOARD_INSET_EVENT = 'bemoKeyboardInsetChange';

let isInstalled = false;

export const mobileKeyboardInset = ref(0);

function handleKeyboardInsetChange(event: Event) {
  const customEvent = event as CustomEvent<{ height?: number }>;
  const nextHeight = Math.max(0, Number(customEvent.detail?.height || 0));
  mobileKeyboardInset.value = nextHeight;
}

export function installMobileKeyboardInsetBridge() {
  if (isInstalled || typeof window === 'undefined') {
    return;
  }

  if (!isMobileProductShell() || !isAndroidNativePlatform()) {
    return;
  }

  isInstalled = true;
  window.addEventListener(MOBILE_KEYBOARD_INSET_EVENT, handleKeyboardInsetChange as EventListener);
}
