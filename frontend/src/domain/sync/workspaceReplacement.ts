import type { NoteMeta } from '../notes/notesTypes.js';
import type { ChangeRecord, SyncTarget } from './mutationLogStorage.js';
import type { SyncStateRecord } from './syncStateStorage.js';
import type { SyncBaseline } from './syncBaseline.js';
import { scopedSyncKey } from './syncTargetIdentity.js';

/** Schedule replacement records in the same transaction as the primary snapshot. */
export function scheduleWorkspaceReplacement(tx: IDBTransaction, before: NoteMeta[], notes: NoteMeta[], trash: NoteMeta[],
  pending: ChangeRecord[], state: SyncStateRecord[], deviceId: string, current?: { target: SyncTarget; targetId: string }) {
  const after = new Map<string, { note: NoteMeta; scope: 'active' | 'trash' }>([...notes.map(note => [note.note_id, { note, scope: 'active' }] as const),
    ...trash.map(note => [note.note_id, { note, scope: 'trash' }] as const)]);
  const targets = new Map<string, SyncTarget>();
  const baselines = new Map<string, SyncBaseline>();
  for (const change of pending) {
    const target = change.target || current?.target;
    if (target) {
      const owner = state.find(row => row.key === `legacy_target_owner:${target}`)?.value;
      const id = change.target_id || owner || (current?.target === target ? current.targetId : undefined);
      if (id) change.target_id = id;
      targets.set(id || `legacy:${target}`, target);
    }
  }
  for (const row of state) {
    if (!row.key.startsWith('sync:')) continue;
    const [, encoded, ...name] = row.key.split(':');
    const id = decodeURIComponent(encoded!);
    if (!id.startsWith('server:') && !id.startsWith('webdav:')) continue;
    targets.set(id, id.startsWith('server:') ? 'server' : 'webdav');
    if (name.join(':').startsWith('baseline:')) baselines.set(row.key, JSON.parse(row.value) as SyncBaseline);
  }
  if (current) targets.set(current.targetId, current.target);
  tx.objectStore('mutationLog').clear();
  for (const [targetId, target] of targets) {
    const boundId = targetId.startsWith('legacy:') ? undefined : targetId;
    const ids = new Set([...before.map(note => note.note_id), ...after.keys(),
      ...pending.filter(change => change.target === target && change.target_id === boundId).map(change => change.entity_id)]);
    for (const [key, baseline] of baselines) if (key.startsWith(scopedSyncKey(targetId, 'baseline:')) && baseline.scope !== 'purged') ids.add(baseline.note_id);
    for (const id of ids) {
      const desired = after.get(id), scope = desired?.scope || 'purged';
      if (boundId) {
        const key = scopedSyncKey(boundId, `deleted:${encodeURIComponent(id)}`);
        if (scope === 'purged') tx.objectStore('syncState').put({ key, value: '1' });
        else tx.objectStore('syncState').delete(key);
      }
      const baseline = baselines.get(scopedSyncKey(targetId, `baseline:${encodeURIComponent(id)}`));
      tx.objectStore('mutationLog').add({ operation_id: `op_${crypto.randomUUID()}`, device_id: deviceId,
        entity_id: id, target, target_id: boundId,
        type: scope === 'purged' ? 'note.purge' : scope === 'trash' ? 'note.trash' : 'note.update',
        base_revision: baseline?.revision ?? 0, timestamp: new Date().toISOString(), createdAt: Date.now(),
        payload: { ...desired?.note, workspace_replacement: true, desired_scope: scope },
      } satisfies ChangeRecord);
    }
  }
}
