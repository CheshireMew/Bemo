import axios from 'axios';
import type { SyncChange, SyncTransport } from './syncTransport.js';

function parseRetryAfterMs(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.min(value * 1_000, 60_000);
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1_000, 60_000);
  }
  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) return null;
  return Math.max(0, Math.min(retryAt - Date.now(), 60_000));
}

function annotateSyncTransportError(error: unknown): never {
  if (!axios.isAxiosError(error)) {
    throw error;
  }
  const retryAfterHeader = error.response?.headers?.['retry-after'];
  const retryAfterMs = parseRetryAfterMs(Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader);
  const nextError = error as Error & { retryAfterMs?: number | null };
  if (retryAfterMs !== null) {
    nextError.retryAfterMs = retryAfterMs;
  }
  throw nextError;
}

export function createServerTransport(serverUrl: string, accessToken: string): SyncTransport {
  const api = axios.create({
    baseURL: serverUrl.replace(/\/$/, ''),
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return {
    async pull(cursor: string | null) {
      try {
        const response = await api.get('/api/sync/pull', {
          params: cursor ? { cursor } : undefined,
        });
        return response.data;
      } catch (error) {
        annotateSyncTransportError(error);
      }
    },
    async inspectBootstrap() {
      try {
        const response = await api.get('/api/sync/state');
        return response.data;
      } catch (error) {
        annotateSyncTransportError(error);
      }
    },
    async push(changes: SyncChange[]) {
      try {
        const response = await api.post('/api/sync/push', { changes });
        return response.data;
      } catch (error) {
        annotateSyncTransportError(error);
      }
    },
    async hasBlob(blobHash: string) {
      try {
        const response = await api.head(`/api/sync/blobs/${encodeURIComponent(blobHash)}`);
        return response.status >= 200 && response.status < 300;
      } catch {
        return false;
      }
    },
    async putBlob(blobHash: string, data: Uint8Array, mimeType = 'application/octet-stream') {
      try {
        await api.put(`/api/sync/blobs/${encodeURIComponent(blobHash)}`, data, {
          headers: {
            'Content-Type': mimeType,
          },
        });
      } catch (error) {
        annotateSyncTransportError(error);
      }
    },
    async getBlob(blobHash: string) {
      try {
        const response = await api.get(`/api/sync/blobs/${encodeURIComponent(blobHash)}`, {
          responseType: 'arraybuffer',
        });
        return new Uint8Array(response.data);
      } catch (error) {
        annotateSyncTransportError(error);
      }
    },
  };
}
