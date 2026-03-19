export type SyncStatus = 'online' | 'offline' | 'syncing';

export type SyncState = {
  status: SyncStatus;
  pendingCount: number;
  serverPendingCount: number;
  webdavPendingCount: number;
  target: string;
  error: string;
  serverLastSyncAt: string;
  webdavLastSyncAt: string;
};

export type SyncListener = (state: SyncState) => void;
