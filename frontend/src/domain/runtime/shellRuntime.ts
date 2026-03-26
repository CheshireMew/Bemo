import { Capacitor } from '@capacitor/core';

export type ProductShell = 'web-desktop' | 'mobile';

export function getProductShell(): ProductShell {
  if (!Capacitor.isNativePlatform()) {
    return 'web-desktop';
  }

  const platform = Capacitor.getPlatform();
  if (platform === 'android' || platform === 'ios') {
    return 'mobile';
  }

  return 'web-desktop';
}

export function isMobileProductShell() {
  return getProductShell() === 'mobile';
}
