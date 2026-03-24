import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  hasBackendOrigin,
  hasSyncProxyToken,
  resolveBackendUrl,
  SYNC_PROXY_TOKEN,
} from '../../../config.js';
import { readSyncConfigSnapshot } from '../syncConfig.js';

type WebDavResponseType = 'text' | 'arraybuffer';
type NativeBodyEncoding = 'text' | 'base64' | 'json';

type NativeHttpRequestPayload = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  bodyEncoding?: 'text' | 'base64';
};

type NativeHttpResponsePayload = {
  status: number;
  url: string;
  headers: Record<string, string>;
  body?: string;
  bodyEncoding?: 'base64';
};

type NativeHttpPlugin = {
  request(payload: NativeHttpRequestPayload): Promise<NativeHttpResponsePayload>;
};

const NativeHttp = registerPlugin<NativeHttpPlugin>('NativeHttp');

export type WebDavRequestInit = RequestInit & {
  responseType?: WebDavResponseType;
};

class NativeWebDavResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: Headers;
  readonly url: string;

  private readonly body: unknown;
  private readonly bodyEncoding: NativeBodyEncoding;

  constructor(input: {
    status: number;
    url: string;
    headers: Record<string, string>;
    body: unknown;
    bodyEncoding: NativeBodyEncoding;
  }) {
    this.status = input.status;
    this.ok = input.status >= 200 && input.status < 300;
    this.headers = new Headers(input.headers);
    this.url = input.url;
    this.body = input.body;
    this.bodyEncoding = input.bodyEncoding;
  }

  async text() {
    if (this.bodyEncoding === 'text') {
      return typeof this.body === 'string' ? this.body : '';
    }
    if (this.bodyEncoding === 'json') {
      return JSON.stringify(this.body ?? null);
    }
    return decodeBytesAsText(decodeBase64ToBytes(typeof this.body === 'string' ? this.body : ''));
  }

  async json<T = unknown>() {
    if (this.bodyEncoding === 'json') {
      return this.body as T;
    }
    return JSON.parse(await this.text()) as T;
  }

  async arrayBuffer() {
    if (this.bodyEncoding === 'base64') {
      const bytes = decodeBase64ToBytes(typeof this.body === 'string' ? this.body : '');
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    const text = await this.text();
    return encodeTextAsBytes(text).buffer;
  }
}

function isTauriDesktop() {
  return typeof window !== 'undefined' && typeof (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== 'undefined';
}

function isCapacitorAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function isBrowserWebPlatform() {
  return typeof window !== 'undefined' && !isTauriDesktop() && !isCapacitorAndroid();
}

function normalizeHeaders(headers?: HeadersInit) {
  if (!headers) return {} as Record<string, string>;

  const record: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      record[key] = value;
    }
    return record;
  }

  for (const [key, value] of Object.entries(headers)) {
    record[key] = value;
  }
  return record;
}

function encodeTextAsBytes(value: string) {
  return new TextEncoder().encode(value);
}

function decodeBytesAsText(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}

function encodeBytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function decodeBase64ToBytes(value: string) {
  const normalized = value.replace(/\s+/g, '');
  if (!normalized) return new Uint8Array();
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toUint8Array(value: ArrayBuffer | ArrayBufferView) {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

async function serializeBody(body: BodyInit | null | undefined) {
  if (body === null || body === undefined) return null;

  if (typeof body === 'string') {
    return { body, bodyEncoding: 'text' as const };
  }

  if (body instanceof URLSearchParams) {
    return { body: body.toString(), bodyEncoding: 'text' as const };
  }

  if (body instanceof Blob) {
    return {
      body: encodeBytesToBase64(new Uint8Array(await body.arrayBuffer())),
      bodyEncoding: 'base64' as const,
    };
  }

  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return {
      body: encodeBytesToBase64(toUint8Array(body)),
      bodyEncoding: 'base64' as const,
    };
  }

  throw new Error('Unsupported WebDAV request body');
}

async function requestViaTauri(url: string, init: WebDavRequestInit) {
  const payloadBody = await serializeBody(init.body);
  const { invoke } = await import('@tauri-apps/api/core');
  const response = await invoke<NativeHttpResponsePayload>('native_http_request', {
    payload: {
      url,
      method: init.method || 'GET',
      headers: normalizeHeaders(init.headers),
      body: payloadBody?.body,
      bodyEncoding: payloadBody?.bodyEncoding,
    } satisfies NativeHttpRequestPayload,
  });

  return new NativeWebDavResponse({
    status: response.status,
    url: response.url || url,
    headers: response.headers || {},
    body: response.body || '',
    bodyEncoding: 'base64',
  });
}

async function requestViaCapacitor(url: string, init: WebDavRequestInit) {
  const serializedBody = await serializeBody(init.body);
  const response = await NativeHttp.request({
    url,
    method: init.method || 'GET',
    headers: normalizeHeaders(init.headers),
    body: serializedBody?.body,
    bodyEncoding: serializedBody?.bodyEncoding,
  });

  return new NativeWebDavResponse({
    status: response.status,
    url: response.url || url,
    headers: response.headers || {},
    body: response.body || '',
    bodyEncoding: 'base64',
  });
}

function getWebDavProxyAccessToken() {
  return SYNC_PROXY_TOKEN || readSyncConfigSnapshot().accessToken;
}

// Browser WebDAV access is constrained by third-party CORS policy.
// Desktop and Android can use native HTTP directly, but the web build must
// keep this proxy path for common providers that do not allow browser CORS.
export function shouldProxyWebDavThroughBackend() {
  return isBrowserWebPlatform();
}

export function hasWebDavBackendProxyConfig() {
  return !isBrowserWebPlatform() || hasBackendOrigin();
}

export function hasWebDavBackendProxyAccess() {
  return Boolean(getWebDavProxyAccessToken());
}

export function hasBundledWebDavProxyAccessToken() {
  return hasSyncProxyToken();
}

async function requestViaBackend(url: string, init: WebDavRequestInit) {
  const accessToken = getWebDavProxyAccessToken();
  if (!accessToken) {
    throw new Error('网页端 WebDAV 需要填写同步服务器 Token，才能通过后端代理访问第三方 WebDAV。');
  }

  // This is a transport bridge for the browser runtime only.
  // WebDAV ownership still lives in the frontend sync engine.
  const proxyUrl = resolveBackendUrl('/api/sync/webdav/request');
  if (!proxyUrl) {
    throw new Error('当前网页端没有可用的同步服务器代理地址。');
  }

  const serializedBody = await serializeBody(init.body);
  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      url,
      method: init.method || 'GET',
      headers: normalizeHeaders(init.headers),
      body: serializedBody?.body,
      bodyEncoding: serializedBody?.bodyEncoding,
    } satisfies NativeHttpRequestPayload),
  });

  if (!response.ok) {
    let message = `WebDAV 代理请求失败 (${response.status})`;
    try {
      const payload = await response.json() as { detail?: string };
      if (payload?.detail) message = payload.detail;
    } catch {
      // Ignore non-JSON error payloads and keep the status-based message.
    }
    throw new Error(message);
  }

  const payload = await response.json() as NativeHttpResponsePayload;
  return new NativeWebDavResponse({
    status: payload.status,
    url: payload.url || url,
    headers: payload.headers || {},
    body: payload.body || '',
    bodyEncoding: 'base64',
  });
}

export async function webdavHttpRequest(url: string, init: WebDavRequestInit = {}) {
  if (isTauriDesktop()) {
    return requestViaTauri(url, init);
  }

  if (isCapacitorAndroid()) {
    return requestViaCapacitor(url, init);
  }

  if (shouldProxyWebDavThroughBackend()) {
    if (!hasWebDavBackendProxyConfig()) {
      throw new Error('网页端 WebDAV 需要先配置同步服务器地址，当前网页构建没有可用的 API_BASE。请通过 start-dev 脚本启动，或为网页端设置 VITE_WEB_API_BASE_URL。');
    }
    return requestViaBackend(url, init);
  }

  return fetch(url, init);
}
