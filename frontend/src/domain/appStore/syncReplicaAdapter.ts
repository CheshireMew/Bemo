import { appRequest, AppApiError } from './backendAppApi.js';
import { shouldUseBackendAppStore } from '../runtime/appStoreRuntime.js';
import { applyChangesLocally, type SyncNoteStore } from '../sync/localSyncApply.js';
import { deriveNoteTitle, normalizeAppNoteRecord, normalizeNoteContentPayload, normalizeNoteTimestampSeconds } from '../notes/noteContract.js';
import type { NoteMeta } from '../notes/notesTypes.js';
import type { SyncChange } from '../sync/syncTransport.js';
import type { ChangeRecord } from '../sync/mutationLogStorage.js';

type ApplyResult = Awaited<ReturnType<typeof applyChangesLocally>>;
type Replica = { token: string; notes: NoteMeta[]; trash: NoteMeta[]; receipts: Record<string, ApplyResult> };

export async function editBackendReplica<T>(edit: (store: SyncNoteStore, active: Map<string, NoteMeta>, trash: Map<string, NoteMeta>) => Promise<T>, options: { changes?: SyncChange[]; outbox?: ChangeRecord[] } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await appRequest<Replica>('/api/app/replica/read', { method: 'POST', body: JSON.stringify({ operation_ids: options.changes?.map(c => c.operation_id).filter(Boolean) || [] }) });
    const normalize = (notes: NoteMeta[]) => new Map(notes.map(note => {
      const normalized = normalizeAppNoteRecord(note);
      if (!normalized) throw new Error('主存储返回了无效的同步笔记。');
      return [normalized.note_id, normalized];
    }));
    const active = normalize(snapshot.notes), trash = normalize(snapshot.trash);
    const now = () => Math.floor(Date.now() / 1000);
    const applyState = async (destination: Map<string, NoteMeta>, noteId: string, payload: Record<string, unknown>, current?: NoteMeta | null) => {
      const existing = current ?? active.get(noteId) ?? trash.get(noteId);
      const remote = normalizeNoteContentPayload(payload, existing?.revision ?? 1);
      const note: NoteMeta = {
        note_id: noteId, filename: remote.filename || existing?.filename || `${noteId}.md`,
        content: remote.content, title: deriveNoteTitle(remote.content), tags: remote.tags,
        pinned: remote.pinned ?? existing?.pinned ?? false,
        revision: existing ? Math.max(existing.revision + 1, remote.revision) : remote.revision,
        created_at: existing?.created_at ?? normalizeNoteTimestampSeconds(remote.created_at), updated_at: now(),
      };
      // A canonical ID belongs to exactly one list, including conflict recreation.
      (destination === active ? trash : active).delete(noteId);
      destination.set(noteId, note);
      return note;
    };
    const store: SyncNoteStore = {
      findLocalNoteById: async id => active.get(id) ?? null,
      findLocalTrashNoteById: async id => trash.get(id) ?? null,
      applyRemoteActiveState: (id, payload, current) => applyState(active, id, payload, current),
      applyRemoteTrashState: (id, payload, current) => applyState(trash, id, payload, current),
      updateLocalNoteById: async (id, update) => {
        const current = active.get(id); if (!current) return null;
        const next = update(current); active.set(id, next); return next;
      },
      moveLocalNoteToTrashById: async id => {
        const note = active.get(id); if (!note) return null;
        active.delete(id); trash.set(id, { ...note, revision: note.revision + 1, updated_at: now() }); return note;
      },
      restoreLocalTrashNote: async id => {
        const note = trash.get(id); if (!note) throw new Error('回收站笔记不存在。');
        const restored = { ...note, revision: note.revision + 1, updated_at: now() };
        trash.delete(id); active.set(id, restored); return restored;
      },
      purgeLocalNoteById: async id => {
        const note = trash.get(id) ?? active.get(id) ?? null; trash.delete(id); active.delete(id); return note;
      },
      createLocalConflictCopy: async note => {
        const id = `conflict_${crypto.randomUUID()}`;
        const copy = { ...note, note_id: id, filename: `${id}.md`, title: `冲突副本 - ${note.title}`, revision: 1, created_at: now(), updated_at: now(), pinned: false };
        active.set(id, copy); return copy;
      },
    };
    const receipts: Record<string, ApplyResult> = {};
    let result: T;
    if (options.changes) {
      const combined: ApplyResult = { applied: [], conflicts: [] };
      for (const change of options.changes) {
        const id = change.operation_id;
        const item = (id && snapshot.receipts[id]) || await applyChangesLocally([change], store);
        combined.applied.push(...item.applied); combined.conflicts.push(...item.conflicts);
        if (id) receipts[id] = item;
      }
      result = combined as T;
    } else result = await edit(store, active, trash);
    try {
      await appRequest('/api/app/replica/commit', { method: 'POST', body: JSON.stringify({ token: snapshot.token, notes: [...active.values()], trash: [...trash.values()], receipts, outbox: options.outbox ?? [] }) });
      return result;
    } catch (error) {
      if (!(error instanceof AppApiError) || error.status !== 409 || attempt === 2) throw error;
    }
  }
  throw new Error('主存储持续变化，请重试同步。');
}

export function applyChangesToCurrentStore(changes: SyncChange[]): Promise<ApplyResult> {
  return shouldUseBackendAppStore()
    ? editBackendReplica<ApplyResult>(async () => ({ applied: [], conflicts: [] }), { changes })
    : applyChangesLocally(changes);
}
