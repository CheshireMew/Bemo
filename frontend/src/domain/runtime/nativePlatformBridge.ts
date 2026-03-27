import { registerPlugin } from '@capacitor/core';

import {
  shouldUseNativeClipboardBridge,
  shouldUseNativeOpenBridge,
} from './platformCapabilities.js';

type NativeHostPlugin = {
  copyToClipboard(payload: {
    text: string;
    html?: string;
  }): Promise<void>;
  performDefaultBack(): Promise<void>;
  openUrl(payload: {
    url: string;
  }): Promise<void>;
  openBinary(payload: {
    fileName: string;
    mimeType: string;
    base64Data: string;
  }): Promise<void>;
};

const NativeHost = registerPlugin<NativeHostPlugin>('NativeHost');

function encodeBytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function isNetworkUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function sanitizeFileName(value: string) {
  const normalized = (value || '').trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_');
  return normalized || `bemo-${Date.now()}`;
}

function inferFileName(url: string, fallbackPrefix: string) {
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
    const candidate = parsed.pathname.split('/').pop() || '';
    return sanitizeFileName(candidate || `${fallbackPrefix}-${Date.now()}`);
  } catch {
    return sanitizeFileName(`${fallbackPrefix}-${Date.now()}`);
  }
}

async function copyViaBrowserClipboard(input: {
  text: string;
  html?: string;
}) {
  if (input.html && typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
    const item = new ClipboardItem({
      'text/html': new Blob([input.html], { type: 'text/html' }),
      'text/plain': new Blob([input.text], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
    return;
  }

  await navigator.clipboard.writeText(input.text);
}

export async function copyContentToClipboard(input: {
  text: string;
  html?: string;
}) {
  if (shouldUseNativeClipboardBridge()) {
    await NativeHost.copyToClipboard(input);
    return;
  }

  await copyViaBrowserClipboard(input);
}

export async function performDefaultNativeBackNavigation() {
  if (!shouldUseNativeOpenBridge()) {
    return;
  }

  await NativeHost.performDefaultBack();
}

export async function openExternalResource(input: {
  url: string;
  fileName?: string;
  mimeType?: string;
}) {
  const targetUrl = input.url;
  if (!targetUrl) {
    throw new Error('缺少可打开的资源地址。');
  }

  if (shouldUseNativeOpenBridge()) {
    if (isNetworkUrl(targetUrl)) {
      await NativeHost.openUrl({ url: targetUrl });
      return;
    }

    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`资源读取失败 (${response.status})`);
    }

    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await NativeHost.openBinary({
      fileName: sanitizeFileName(input.fileName || inferFileName(targetUrl, 'bemo-file')),
      mimeType: input.mimeType || blob.type || 'application/octet-stream',
      base64Data: encodeBytesToBase64(bytes),
    });
    return;
  }

  window.open(targetUrl, '_blank', 'noopener,noreferrer');
}
