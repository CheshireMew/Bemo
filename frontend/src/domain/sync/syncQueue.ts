import { appRequest } from '../appStore/backendAppApi.js';
import { shouldUseBackendAppStore } from '../runtime/appStoreRuntime.js';
import { getMutationLog, removeMutation, type ChangeRecord, type SyncTarget } from './mutationLogStorage.js';

export type PendingChange = ChangeRecord & { storage?: 'backend' };

export async function getPendingChanges(target?: SyncTarget): Promise<PendingChange[]> {
  const local = await getMutationLog(target);
  if (!shouldUseBackendAppStore()) return local;
  const batches = await Promise.all((target ? [target] : ['server', 'webdav']).map(t =>
    appRequest<ChangeRecord[]>(`/api/app/outbox?target=${t}`)));
  return [...local, ...batches.flat().map(change => ({ ...change, storage: 'backend' as const, createdAt: Date.parse(change.timestamp) }))]
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function acknowledgeChange(change: PendingChange) {
  if (change.storage === 'backend') {
    await appRequest(`/api/app/outbox/${encodeURIComponent(change.operation_id)}`, { method: 'DELETE' });
  } else if (change.id !== undefined) await removeMutation(change.id);
}

export async function getPendingCountsByTarget() {
  const queue = await getPendingChanges();
  return { server: queue.filter(c => c.target === 'server').length, webdav: queue.filter(c => c.target === 'webdav').length };
}
