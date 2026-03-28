import { ref } from 'vue';

import { isAndroidNativePlatform, isMobileProductShell } from './platformCapabilities.js';

const MOBILE_KEYBOARD_INSET_EVENT = 'bemoKeyboardInsetChange';

let isInstalled = false;

export const mobileKeyboardInset = ref(0);

function normalizeKeyboardInsetPayload(input: unknown) {
  if (typeof input === 'number') {
    return input;
  }

  if (typeof input === 'string') {
    try {
      return normalizeKeyboardInsetPayload(JSON.parse(input));
    } catch {
      return Number(input || 0);
    }
  }

  if (input && typeof input === 'object') {
    const record = input as { height?: unknown };
    return Number(record.height || 0);
  }

  return 0;
}

function handleKeyboardInsetChange(event: Event) {
  const customEvent = event as CustomEvent<unknown> & { data?: unknown };
  const payload = customEvent.detail ?? customEvent.data ?? customEvent;
  const nextHeight = Math.max(0, normalizeKeyboardInsetPayload(payload));
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
