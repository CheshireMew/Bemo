import { Capacitor } from '@capacitor/core';

import { getProductShell } from './shellRuntime.js';

export function isAndroidNativePlatform() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function isMobileProductShell() {
  return getProductShell() === 'mobile';
}

export function canRestoreFromSyncDirectory() {
  return !isMobileProductShell();
}

export function canShowShortcutSettingsTab() {
  return !isMobileProductShell();
}

export function shouldUseNativeClipboardBridge() {
  return isAndroidNativePlatform();
}

export function shouldUseNativeOpenBridge() {
  return isAndroidNativePlatform();
}
