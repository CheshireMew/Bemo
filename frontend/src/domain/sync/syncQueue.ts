import { appRequest } from '../appStore/backendAppApi.js';
import { shouldUseBackendAppStore } from '../runtime/appStoreRuntime.js';
import { bindLegacyMutationTarget, getMutationLog, removeMutation, type ChangeRecord, type SyncTarget } from './mutationLogStorage.js';

export type PendingChange = ChangeRecord & { storage?: 'backend' };

export async function getPendingChanges(target?: SyncTarget, targetId?: string): Promise<PendingChange[]> {
  const local = await getMutationLog(target, targetId);
  if (!shouldUseBackendAppStore()) return local;
  const batches = await Promise.all((target ? [target] : ['server', 'webdav']).map(t =>
    appRequest<ChangeRecord[]>(`/api/app/outbox?target=${t}${targetId ? `&target_id=${encodeURIComponent(targetId)}` : ''}`)));
  return [...local, ...batches.flat().map(change => ({ ...change, storage: 'backend' as const, createdAt: Date.parse(change.timestamp) }))]
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function bindLegacySyncTarget(target: SyncTarget, targetId: string) {
  await bindLegacyMutationTarget(target, targetId);
  if (shouldUseBackendAppStore()) await appRequest('/api/app/outbox/claim', {
    method: 'POST', body: JSON.stringify({ target, target_id: targetId }),
  });
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
