import { collectSyncAttachments, ensureBlobIndexValid, materializeIncomingAttachment } from '../attachments/attachmentBlobRuntime.js';
import type { ChangeRecord } from './mutationLogStorage.js';
import { buildSyncTransport } from './syncTransportBuilder.js';
import type { SyncChange } from './syncTransport.js';
import { shouldUseBackendAppStore } from '../runtime/appStoreRuntime.js';
import { uploadBackendAttachment, BackendAttachmentError } from '../attachments/backendAttachmentsApi.js';
import { getAttachmentContentBlob } from '../attachments/blobStorage.js';
import { contentAttachmentFilename, rewriteAttachmentFilenames } from '../attachments/attachmentLinks.js';

function changeToRemoteShape(change: ChangeRecord) {
  const { edit_version: _editVersion, workspace_replacement: _replacement, desired_scope: _scope, ...payload } = change.payload;
  return {
    operation_id: change.operation_id,
    device_id: change.device_id,
    entity_id: change.entity_id,
    type: change.type,
    timestamp: change.timestamp,
    base_revision: change.base_revision,
    payload,
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
  if (!transport) return changes;
  const hydrated: SyncChange[] = [];
  for (const change of changes) {
    const names = new Map<string, string>();
    const normalizedAttachments: Array<{ filename: string; blob_hash: string; mime_type: string }> = [];
    const attachments = Array.isArray(change?.payload?.attachments) ? change.payload.attachments : [];
    for (const attachment of attachments) {
      const blobHash = typeof attachment?.blob_hash === 'string' ? attachment.blob_hash : '';
      const filename = typeof attachment?.filename === 'string' ? attachment.filename : '';
      const mimeType = typeof attachment?.mime_type === 'string' ? attachment.mime_type : 'application/octet-stream';
      if (!blobHash || !filename) continue;
      const cached = !shouldUseBackendAppStore() && await ensureBlobIndexValid(blobHash)
        ? await getAttachmentContentBlob(blobHash) : null;
      const data = cached ? new Uint8Array(await cached.arrayBuffer()) : await transport.getBlob(blobHash);
      const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(data));
      const actualHash = `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
      if (actualHash !== blobHash) throw new Error(`同步附件校验失败：${filename}`);
      if (shouldUseBackendAppStore()) {
        let stored;
        try { stored = await uploadBackendAttachment({ filename, data: Uint8Array.from(data).buffer, mimeType }); }
        catch (error) {
          if (!(error instanceof BackendAttachmentError) || error.status !== 409) throw error;
          stored = await uploadBackendAttachment({ filename: contentAttachmentFilename(blobHash, filename), data: Uint8Array.from(data).buffer, mimeType });
        }
        if (stored.blob_hash !== blobHash) throw new Error(`主存储未能保存同步附件：${filename}`);
        names.set(filename, stored.filename);
        normalizedAttachments.push({ filename: stored.filename, blob_hash: blobHash, mime_type: mimeType });
      } else {
        const stored = await materializeIncomingAttachment(filename, data, blobHash, mimeType);
        names.set(filename, stored);
        normalizedAttachments.push({ filename: stored, blob_hash: blobHash, mime_type: mimeType });
      }
    }
    hydrated.push({ ...change, payload: { ...change.payload,
      ...(typeof change.payload?.content === 'string' ? { content: rewriteAttachmentFilenames(change.payload.content, names) } : {}),
      ...(Array.isArray(change.payload?.attachments) ? { attachments: normalizedAttachments } : {}),
    } });
  }
  return hydrated;
}
