import axios from 'axios';
import { API_BASE } from '../config';
import { settings } from '../store/settings';
import {
  addConflict,
  getMutationLog,
  getOrCreateDeviceId,
  getSyncStateValue,
  removeMutation,
  setSyncStateValue,
  type ChangeRecord,
} from './db';
import { createServerTransport } from './serverTransport';
import { collectSyncAttachments, ensureLocalAttachment } from './syncAttachments';
import { createWebDavTransport } from './webdavTransport';

export type SyncStatus = 'online' | 'offline' | 'syncing';

type SyncListener = (state: {
  status: SyncStatus;
  pendingCount: number;
  target: string;
  error: string;
  serverLastSyncAt: string;
  webdavLastSyncAt: string;
}) => void;

let listeners: SyncListener[] = [];
let currentStatus: SyncStatus = navigator.onLine ? 'online' : 'offline';
let currentTarget = '本地';
let currentError = '';
let currentServerLastSyncAt = '';
let currentWebdavLastSyncAt = '';
let flushInFlight: Promise<void> | null = null;

function notify(pendingCount: number) {
  listeners.forEach((fn) => fn({
    status: currentStatus,
    pendingCount,
    target: currentTarget,
    error: currentError,
    serverLastSyncAt: currentServerLastSyncAt,
    webdavLastSyncAt: currentWebdavLastSyncAt,
  }));
}

function getMode() {
  return settings.sync.mode;
}

function getTargetLabel() {
  if (settings.sync.mode === 'server') return '自部署服务器';
  if (settings.sync.mode === 'webdav') return 'WebDAV';
  return '本地';
}

export function onSyncStatusChange(fn: SyncListener): () => void {
  listeners.push(fn);
  void Promise.all([
    getMutationLog(),
    getSyncStateValue('server_last_sync_at'),
    getSyncStateValue('webdav_last_sync_at'),
  ]).then(([q, serverLast, webdavLast]) => {
    currentTarget = getTargetLabel();
    currentServerLastSyncAt = serverLast || '';
    currentWebdavLastSyncAt = webdavLast || '';
    notify(q.length);
  });
  return () => {
    listeners = listeners.filter((item) => item !== fn);
  };
}

function buildTransport() {
  if (settings.sync.mode === 'server' && settings.sync.serverUrl && settings.sync.accessToken) {
    return createServerTransport(settings.sync.serverUrl, settings.sync.accessToken);
  }
  if (settings.sync.mode === 'webdav' && settings.sync.webdavUrl && settings.sync.username && settings.sync.password) {
    return createWebDavTransport({
      webdavUrl: settings.sync.webdavUrl,
      username: settings.sync.username,
      password: settings.sync.password,
      basePath: settings.sync.basePath,
    });
  }
  return null;
}

async function applyChangesLocally(changes: ChangeRecord[] | any[]) {
  if (changes.length === 0) return { conflicts: [] as any[] };
  const response = await axios.post(`${API_BASE}/sync/local/apply`, { changes });
  return response.data;
}

function changeToRemoteShape(change: ChangeRecord) {
  return {
    operation_id: change.operation_id,
    device_id: change.device_id,
    entity_id: change.entity_id,
    type: change.type,
    timestamp: change.timestamp,
    base_revision: change.base_revision,
    payload: change.payload,
  };
}

async function prepareOutboundChanges(queue: ChangeRecord[], transport: ReturnType<typeof buildTransport>) {
  const blobUploads = new Map<string, { data: Uint8Array; mimeType: string }>();
  const outboundChanges = await Promise.all(queue.map(async (change) => {
    const remoteChange = changeToRemoteShape(change);
    const content = typeof remoteChange.payload?.content === 'string' ? remoteChange.payload.content : null;
    if (!content) {
      return remoteChange;
    }

    const attachments = await collectSyncAttachments(content);
    for (const attachment of attachments) {
      if (!blobUploads.has(attachment.blob_hash)) {
        blobUploads.set(attachment.blob_hash, {
          data: attachment.data,
          mimeType: attachment.mime_type,
        });
      }
    }

    return {
      ...remoteChange,
      payload: {
        ...remoteChange.payload,
        attachments: attachments.map(({ data, ...attachment }) => attachment),
      },
    };
  }));

  if (transport) {
    for (const [blobHash, blob] of blobUploads) {
      if (!(await transport.hasBlob(blobHash))) {
        await transport.putBlob(blobHash, blob.data, blob.mimeType);
      }
    }
  }

  return outboundChanges;
}

async function hydrateInboundAttachments(changes: any[], transport: ReturnType<typeof buildTransport>) {
  if (!transport) return;
  for (const change of changes) {
    const attachments = Array.isArray(change?.payload?.attachments) ? change.payload.attachments : [];
    for (const attachment of attachments) {
      const blobHash = typeof attachment?.blob_hash === 'string' ? attachment.blob_hash : '';
      const filename = typeof attachment?.filename === 'string' ? attachment.filename : '';
      if (!blobHash || !filename) continue;
      const data = await transport.getBlob(blobHash);
      await ensureLocalAttachment(filename, data);
    }
  }
}

export async function flushPendingQueue(): Promise<void> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = (async () => {
    const queue = await getMutationLog();
    currentTarget = getTargetLabel();

    if (getMode() === 'local') {
      currentStatus = navigator.onLine ? 'online' : 'offline';
      currentError = '';
      notify(queue.length);
      return;
    }

    const transport = buildTransport();
    if (!transport) {
      currentStatus = 'offline';
      currentError = '同步配置不完整';
      notify(queue.length);
      return;
    }

    currentStatus = 'syncing';
    currentError = '';
    notify(queue.length);

    try {
      const localOperationIds = new Set(queue.map((item) => item.operation_id));
      const outboundChanges = await prepareOutboundChanges(queue, transport);
      const pushResult = await transport.push(outboundChanges);

      for (const accepted of (pushResult.accepted || [])) {
        const match = queue.find((item) => item.operation_id === accepted.operation_id);
        if (match?.id) {
          await removeMutation(match.id);
        }
      }
      for (const conflict of (pushResult.conflicts || [])) {
        const match = queue.find((item) => item.operation_id === conflict.operation_id);
        if (match?.id) {
          await removeMutation(match.id);
        }
        await addConflict(getMode() as 'server' | 'webdav', {
          note_id: String(conflict.note_id || match?.entity_id || ''),
          operation_id: String(conflict.operation_id || ''),
          reason: String(conflict.reason || 'remote_conflict'),
          ...conflict,
        });
      }

      const cursorKey = getMode() === 'server' ? 'server_cursor' : 'webdav_cursor';
      const previousCursor = await getSyncStateValue(cursorKey);
      const pullResult = await transport.pull(previousCursor);
      const deviceId = await getOrCreateDeviceId();
      const inboundChanges = (pullResult.changes || []).filter((change: any) => {
        if (localOperationIds.has(change.operation_id)) return false;
        return change.device_id !== deviceId;
      });

      await hydrateInboundAttachments(inboundChanges, transport);
      const localApplyResult = await applyChangesLocally(inboundChanges);
      for (const conflict of (localApplyResult.conflicts || [])) {
        await addConflict(getMode() as 'server' | 'webdav', {
          note_id: String(conflict.note_id || ''),
          operation_id: String(conflict.operation_id || ''),
          reason: String(conflict.reason || 'local_apply_conflict'),
          ...conflict,
        });
      }

      if (pullResult.latest_cursor) {
        await setSyncStateValue(cursorKey, String(pullResult.latest_cursor));
      }
      const nowIso = new Date().toISOString();
      if (getMode() === 'server') {
        currentServerLastSyncAt = nowIso;
        await setSyncStateValue('server_last_sync_at', nowIso);
      } else {
        currentWebdavLastSyncAt = nowIso;
        await setSyncStateValue('webdav_last_sync_at', nowIso);
      }

      currentStatus = 'online';
      notify((await getMutationLog()).length);
    } catch (error) {
      currentStatus = 'offline';
      currentError = error instanceof Error ? error.message : '同步失败';
      notify((await getMutationLog()).length);
    }
  })();
  try {
    await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    currentStatus = 'online';
    currentTarget = getTargetLabel();
    notify(0);
    void flushPendingQueue();
  });

  window.addEventListener('offline', () => {
    currentStatus = 'offline';
    currentTarget = getTargetLabel();
    void getMutationLog().then((q) => notify(q.length));
  });
}

export function isOnline(): boolean {
  return navigator.onLine;
}

export function requestSyncNow(): void {
  if (!navigator.onLine) return;
  void flushPendingQueue();
}
