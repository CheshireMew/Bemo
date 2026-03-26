const SYNC_INTERVAL_MS = 60_000;
const SYNC_RESUME_DEBOUNCE_MS = 1_500;
const SYNC_RETRY_BASE_MS = 5_000;
const SYNC_RETRY_MAX_MS = 5 * 60_000;

let scheduledSyncTimer: number | null = null;
let lastForegroundSyncAt = 0;
let retryDelayMs = SYNC_RETRY_BASE_MS;

function readRetryAfterMs(error: unknown) {
  if (!error || typeof error !== 'object' || !('retryAfterMs' in error)) return null;
  const retryAfterMs = (error as { retryAfterMs?: unknown }).retryAfterMs;
  return typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs > 0
    ? Math.min(retryAfterMs, SYNC_RETRY_MAX_MS)
    : null;
}

export function clearScheduledSync() {
  if (!scheduledSyncTimer) return;
  clearTimeout(scheduledSyncTimer);
  scheduledSyncTimer = null;
}

export function scheduleNextSync(requestSyncNow: () => void, delayMs = SYNC_INTERVAL_MS) {
  if (typeof window === 'undefined') return;
  clearScheduledSync();
  scheduledSyncTimer = window.setTimeout(() => {
    requestSyncNow();
  }, delayMs);
}

export function resetRetryDelay() {
  retryDelayMs = SYNC_RETRY_BASE_MS;
}

export function shouldPauseBackgroundSync() {
  if (typeof document === 'undefined') return false;
  return document.visibilityState === 'hidden';
}

export function handleSyncSuccess(requestSyncNow: () => void) {
  resetRetryDelay();
  if (navigator.onLine && !shouldPauseBackgroundSync()) {
    scheduleNextSync(requestSyncNow);
  } else {
    clearScheduledSync();
  }
}

export function handleSyncFailure(requestSyncNow: () => void, error?: unknown) {
  if (navigator.onLine && !shouldPauseBackgroundSync()) {
    const retryAfterMs = readRetryAfterMs(error);
    const delayMs = retryAfterMs !== null ? Math.max(retryDelayMs, retryAfterMs) : retryDelayMs;
    scheduleNextSync(requestSyncNow, delayMs);
    retryDelayMs = Math.min(delayMs * 2, SYNC_RETRY_MAX_MS);
  } else {
    clearScheduledSync();
  }
}

export function maybeSyncOnForeground(requestSyncNow: () => void) {
  if (!navigator.onLine || shouldPauseBackgroundSync()) return;
  const now = Date.now();
  if (now - lastForegroundSyncAt < SYNC_RESUME_DEBOUNCE_MS) return;
  lastForegroundSyncAt = now;
  requestSyncNow();
}
