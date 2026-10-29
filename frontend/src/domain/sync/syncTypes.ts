export type SyncStatus = 'online' | 'offline' | 'syncing';

export type SyncState = {
  completedRuns: number;
  status: SyncStatus;
  pendingCount: number;
  serverPendingCount: number;
  webdavPendingCount: number;
  target: string;
  error: string;
  serverLastSyncAt: string;
  webdavLastSyncAt: string;
};

export type SyncRunResult =
  | { status: 'completed'; targetId: string; pulled: number; pushed: number; conflicts: number }
  | { status: 'failed'; error: string }
  | { status: 'skipped'; reason: string };

export type SyncListener = (state: SyncState) => void;
