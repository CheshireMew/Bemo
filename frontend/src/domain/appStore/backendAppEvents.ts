import { appRequest } from './backendAppApi.js';
import { shouldUseBackendAppStore } from '../runtime/appStoreRuntime.js';
import { shouldPauseBackgroundSync } from '../sync/syncScheduler.js';

export type AppChangeToken = { store_id: string; latest_cursor: string };

export function readAppChangeToken(signal?: AbortSignal) {
  return appRequest<AppChangeToken>('/api/app/change-token', { signal });
}

/** Watch primary data even when this browser has no outbound sync target. */
export function watchBackendAppChanges(onChange: () => void) {
  if (!shouldUseBackendAppStore() || typeof window === 'undefined') return () => {};
  let stopped = false;
  let timer: number | undefined;
  let previous: string | undefined;
  let reconnecting = false;
  const controller = new AbortController();
  const poll = async () => {
    if (stopped) return;
    try {
      if (!shouldPauseBackgroundSync()) {
        const token = await readAppChangeToken(AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]));
        const next = `${token.store_id}:${token.latest_cursor}`;
        // Read once after the first token too: an initial notes request may
        // have raced a device write, or failed before the service recovered.
        if ((reconnecting || next !== previous) && !stopped) onChange();
        previous = next;
        reconnecting = false;
      }
    } catch {
      reconnecting = true;
      // Primary reads expose connection errors. Keep this watcher alive so the
      // page also refreshes after the backend becomes reachable again.
    } finally {
      if (!stopped) timer = window.setTimeout(() => { void poll(); }, 2_000);
    }
  };
  void poll();
  return () => {
    stopped = true;
    controller.abort();
    if (timer !== undefined) window.clearTimeout(timer);
  };
}
