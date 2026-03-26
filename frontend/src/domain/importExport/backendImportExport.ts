import { resolveBackendUrl } from '../../config.js';
import type { BackupPayload } from './backupPayload.js';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = resolveBackendUrl(path);
  if (!url) {
    throw new Error('当前没有可用的应用存储服务地址。');
  }

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = `应用存储请求失败 (${response.status})`;
    try {
      const payload = await response.json() as { detail?: string };
      if (payload.detail) message = payload.detail;
    } catch {
      // Ignore non-JSON failures.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function buildBackendBackupPayload() {
  return request<BackupPayload>('/api/app/storage/backup');
}

export async function applyBackendBackupPayload(payload: Partial<BackupPayload>) {
  return request<{ imported_notes: number; imported_images: number }>('/api/app/storage/backup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
