import type { NoteMeta } from './notesTypes.js';
import { normalizeAppNoteRecord } from './noteContract.js';
import { resolveBackendUrl } from '../../config.js';

type NoteContentPayload = {
  content: string;
  tags: string[];
  attachments?: Array<{
    filename: string;
    blob_hash: string;
    mime_type: string;
  }>;
  created_at?: string;
  pinned?: boolean;
  revision?: number;
};

type NotePatchPayload = {
  pinned?: boolean;
  tags?: string[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = resolveBackendUrl(path);
  if (!url) {
    throw new Error('当前没有可用的笔记服务地址。');
  }

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = `笔记服务请求失败 (${response.status})`;
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

function requireNormalizedNote(input: unknown) {
  const normalized = normalizeAppNoteRecord(input);
  if (!normalized) {
    throw new Error('笔记服务返回了无效的笔记数据。');
  }
  return normalized;
}

export async function listBackendNotes(): Promise<NoteMeta[]> {
  const notes = await request<Array<NoteMeta & { deleted_at?: string }>>('/api/app/notes/');
  return notes.map(requireNormalizedNote);
}

export async function searchBackendNotes(query: string): Promise<NoteMeta[]> {
  const notes = await request<Array<NoteMeta & { deleted_at?: string }>>(`/api/app/notes/search?q=${encodeURIComponent(query)}`);
  return notes.map(requireNormalizedNote);
}

export async function createBackendNote(payload: NoteContentPayload): Promise<NoteMeta> {
  const note = await request<NoteMeta & { deleted_at?: string }>('/api/app/notes/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return requireNormalizedNote(note);
}

export async function updateBackendNote(noteId: string, payload: NoteContentPayload): Promise<NoteMeta> {
  const note = await request<NoteMeta & { deleted_at?: string }>(`/api/app/notes/${encodeURIComponent(noteId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return requireNormalizedNote(note);
}

export async function patchBackendNote(noteId: string, payload: NotePatchPayload): Promise<NoteMeta> {
  const note = await request<NoteMeta & { deleted_at?: string }>(`/api/app/notes/${encodeURIComponent(noteId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return requireNormalizedNote(note);
}

export async function trashBackendNote(noteId: string): Promise<NoteMeta> {
  const note = await request<NoteMeta & { deleted_at?: string }>(`/api/app/notes/${encodeURIComponent(noteId)}`, {
    method: 'DELETE',
  });
  return requireNormalizedNote(note);
}

export async function listBackendTrashNotes(): Promise<NoteMeta[]> {
  const notes = await request<Array<NoteMeta & { deleted_at?: string }>>('/api/app/notes/trash');
  return notes.map(requireNormalizedNote);
}

export async function restoreBackendTrashNote(noteId: string): Promise<NoteMeta> {
  const note = await request<NoteMeta & { deleted_at?: string }>(`/api/app/notes/trash/${encodeURIComponent(noteId)}/restore`, {
    method: 'POST',
  });
  return requireNormalizedNote(note);
}

export async function purgeBackendTrashNote(noteId: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/app/notes/trash/${encodeURIComponent(noteId)}`, {
    method: 'DELETE',
  });
}

export async function emptyBackendTrash(): Promise<number> {
  const payload = await request<{ deleted_count: number }>('/api/app/notes/trash', {
    method: 'DELETE',
  });
  return Number(payload.deleted_count || 0);
}
