import axios from 'axios';

export interface SyncTransport {
  pull(cursor: string | null): Promise<{ changes: any[]; latest_cursor: string }>;
  push(changes: any[]): Promise<{ accepted: any[]; conflicts: any[]; latest_cursor: string }>;
  hasBlob(blobHash: string): Promise<boolean>;
  putBlob(blobHash: string, data: Uint8Array, mimeType?: string): Promise<void>;
  getBlob(blobHash: string): Promise<Uint8Array>;
  cleanupUnusedBlobs?(): Promise<{ deleted: number; retained: number }>;
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
