import axios from 'axios';
import type { SyncTransport } from './syncTransport.js';

export function createServerTransport(serverUrl: string, accessToken: string): SyncTransport {
  const api = axios.create({
    baseURL: serverUrl.replace(/\/$/, ''),
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return {
    async pull(cursor: string | null) {
      const response = await api.get('/api/sync/pull', {
        params: cursor ? { cursor } : undefined,
      });
      return response.data;
    },
    async push(changes: any[]) {
      const response = await api.post('/api/sync/push', { changes });
      return response.data;
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
      await api.put(`/api/sync/blobs/${encodeURIComponent(blobHash)}`, data, {
        headers: {
          'Content-Type': mimeType,
        },
      });
    },
    async getBlob(blobHash: string) {
      const response = await api.get(`/api/sync/blobs/${encodeURIComponent(blobHash)}`, {
        responseType: 'arraybuffer',
      });
      return new Uint8Array(response.data);
    },
  };
}
