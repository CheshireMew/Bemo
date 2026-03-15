/**
 * Sync manager: handles offline queue synchronization.
 * Listens for online events and flushes pending notes to the server.
 */
import axios from 'axios';
import { getPendingQueue, removePendingItem } from './db';
import { API_BASE } from '../config';

export type SyncStatus = 'online' | 'offline' | 'syncing';

type SyncListener = (status: SyncStatus, pendingCount: number) => void;

let listeners: SyncListener[] = [];
let currentStatus: SyncStatus = navigator.onLine ? 'online' : 'offline';

export function onSyncStatusChange(fn: SyncListener): () => void {
  listeners.push(fn);
  // Immediately notify current status
  getPendingQueue().then((q) => fn(currentStatus, q.length));
  return () => { listeners = listeners.filter((l) => l !== fn); };
}

function notify(status: SyncStatus, count: number) {
  currentStatus = status;
  listeners.forEach((fn) => fn(status, count));
}

export async function flushPendingQueue(): Promise<void> {
  const queue = await getPendingQueue();
  if (queue.length === 0) return;

  notify('syncing', queue.length);

  for (const item of queue) {
    try {
      await axios.post(`${API_BASE}/notes/`, {
        content: item.content,
        tags: item.tags?.length ? item.tags : undefined,
      });
      await removePendingItem(item.id!);
      const remaining = (await getPendingQueue()).length;
      notify('syncing', remaining);
    } catch (e) {
      // If a single item fails, stop syncing (server might be down)
      console.error('Sync failed for item', item.id, e);
      notify('offline', (await getPendingQueue()).length);
      return;
    }
  }

  notify('online', 0);
}

// Listen for online/offline events
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    notify('online', 0);
    flushPendingQueue();
  });

  window.addEventListener('offline', () => {
    getPendingQueue().then((q) => notify('offline', q.length));
  });
}

export function isOnline(): boolean {
  return navigator.onLine;
}
