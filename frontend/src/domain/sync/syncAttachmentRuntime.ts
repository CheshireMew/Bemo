import { collectSyncAttachments, ensureBlobIndexValid, ensureLocalAttachment } from '../attachments/attachmentBlobRuntime.js';
import type { ChangeRecord } from './mutationLogStorage.js';
import { buildSyncTransport } from './syncTransportBuilder.js';
import type { SyncChange } from './syncTransport.js';
import { shouldUseBackendAppStore } from '../runtime/appStoreRuntime.js';
import { uploadBackendAttachment } from '../attachments/backendAttachmentsApi.js';

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

export async function prepareOutboundChanges(
  queue: ChangeRecord[],
  transport: ReturnType<typeof buildSyncTransport>,
) {
  const blobUploads = new Map<string, { data: Uint8Array; mimeType: string }>();
  const outboundChanges = await Promise.all(queue.map(async (change) => {
    const remoteChange = changeToRemoteShape(change);
    const content = typeof remoteChange.payload?.content === 'string' ? remoteChange.payload.content : null;
    if (!content) {
      return remoteChange;
    }

    const attachments = await collectSyncAttachments(content, {
      noteId: change.entity_id,
    });
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
        attachments: attachments.map(({ data: _data, ...attachment }) => attachment),
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

export async function hydrateInboundAttachments(
  changes: SyncChange[],
  transport: ReturnType<typeof buildSyncTransport>,
) {
  if (!transport) return;
  for (const change of changes) {
    const attachments = Array.isArray(change?.payload?.attachments) ? change.payload.attachments : [];
    for (const attachment of attachments) {
      const blobHash = typeof attachment?.blob_hash === 'string' ? attachment.blob_hash : '';
      const filename = typeof attachment?.filename === 'string' ? attachment.filename : '';
      const mimeType = typeof attachment?.mime_type === 'string' ? attachment.mime_type : 'application/octet-stream';
      if (!blobHash || !filename) continue;
      if (!shouldUseBackendAppStore() && await ensureBlobIndexValid(blobHash)) continue;
      const data = await transport.getBlob(blobHash);
      const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(data));
      const actualHash = `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
      if (actualHash !== blobHash) throw new Error(`同步附件校验失败：${filename}`);
      if (shouldUseBackendAppStore()) {
        const stored = await uploadBackendAttachment({ filename, data: Uint8Array.from(data).buffer, mimeType });
        if (stored.blob_hash !== blobHash || stored.filename !== filename) throw new Error(`主存储未能保存同步附件：${filename}`);
        continue;
      }
      await ensureLocalAttachment(filename, data, blobHash, mimeType);
    }
  }
}
