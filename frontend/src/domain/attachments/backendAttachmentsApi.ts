import { resolveBackendUrl } from '../../config.js';
import { extractAttachmentFilename } from './attachmentLinks.js';

export type BackendAttachment = {
  filename: string;
  blob_hash: string;
  mime_type: string;
  size?: number;
  url?: string;
};

export type BackendAttachmentSummary = {
  activeAttachments: number;
  trashAttachments: number;
  totalReferencedAttachments: number;
  totalAttachmentRefs: number;
  storedAttachments: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = resolveBackendUrl(path);
  if (!url) {
    throw new Error('当前没有可用的附件服务地址。');
  }

  const response = await fetch(url, init);
  if (!response.ok) {
    let message = `附件服务请求失败 (${response.status})`;
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

export function buildBackendAttachmentAssetUrl(filename: string) {
  return resolveBackendUrl(`/images/${encodeURIComponent(filename)}`);
}

export function resolveBackendAttachmentAssetUrl(markdownUrl: string) {
  const filename = extractAttachmentFilename(markdownUrl);
  if (!filename) {
    return resolveBackendUrl(markdownUrl);
  }
  return buildBackendAttachmentAssetUrl(filename);
}

export async function uploadBackendAttachment(input: {
  filename: string;
  data: Blob | ArrayBuffer;
  mimeType?: string;
}) {
  const url = resolveBackendUrl('/api/app/attachments');
  if (!url) {
    throw new Error('当前没有可用的附件服务地址。');
  }

  const blob = input.data instanceof Blob
    ? input.data
    : new Blob([input.data], { type: input.mimeType || 'application/octet-stream' });
  const form = new FormData();
  form.append('file', blob, input.filename);

  const response = await fetch(url, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    let message = `附件上传失败 (${response.status})`;
    try {
      const payload = await response.json() as { detail?: string };
      if (payload.detail) message = payload.detail;
    } catch {
      // Ignore non-JSON failures.
    }
    throw new Error(message);
  }

  return response.json() as Promise<BackendAttachment>;
}

export async function getBackendAttachmentSummary() {
  return request<BackendAttachmentSummary>('/api/app/storage/attachment-summary');
}

export async function cleanupBackendOrphanAttachments() {
  return request<{ deleted_count: number; deleted_files: string[] }>('/api/app/storage/cleanup-orphans', {
    method: 'POST',
  });
}

export async function clearBackendAppStorage() {
  return request<{ ok: boolean }>('/api/app/storage', {
    method: 'DELETE',
  });
}
