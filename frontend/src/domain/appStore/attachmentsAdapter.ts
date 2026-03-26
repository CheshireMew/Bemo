import {
  cleanupBackendOrphanAttachments,
  getBackendAttachmentSummary,
} from '../attachments/backendAttachmentsApi.js';
import { getAllAttachmentBlobRecords, getAllDraftAttachmentBlobRecords } from '../attachments/blobStorage.js';
import { getAttachmentReferenceSummary } from '../attachments/attachmentRefStorage.js';
import { promoteDraftAttachmentsForContent } from '../attachments/localAttachmentDrafts.js';
import { cleanupOrphanAttachments } from '../attachments/orphanAttachmentCleanup.js';
import { shouldUseBackendAppStore } from '../runtime/appStoreRuntime.js';

export type AttachmentSummary = {
  activeAttachments: number;
  trashAttachments: number;
  draftAttachments: number;
  totalReferencedAttachments: number;
  totalAttachmentRefs: number;
  storedAttachments: number;
  storedDraftAttachments: number;
  unreferencedStoredAttachments: number;
};

export async function finalizeDraftAttachments(sessionKey: string, content: string) {
  if (shouldUseBackendAppStore()) {
    return;
  }
  await promoteDraftAttachmentsForContent(sessionKey, content);
}

export async function readAttachmentSummary(): Promise<AttachmentSummary> {
  if (shouldUseBackendAppStore()) {
    const [backendSummary, localDraftSummary, storedDraftAttachments] = await Promise.all([
      getBackendAttachmentSummary(),
      getAttachmentReferenceSummary(),
      getAllDraftAttachmentBlobRecords(),
    ]);
    return {
      activeAttachments: backendSummary.activeAttachments,
      trashAttachments: backendSummary.trashAttachments,
      draftAttachments: localDraftSummary.draftAttachments,
      totalReferencedAttachments: backendSummary.totalReferencedAttachments + localDraftSummary.draftAttachments,
      totalAttachmentRefs: backendSummary.totalAttachmentRefs + localDraftSummary.draftAttachments,
      storedAttachments: backendSummary.storedAttachments,
      storedDraftAttachments: storedDraftAttachments.length,
      unreferencedStoredAttachments: Math.max(
        backendSummary.storedAttachments - backendSummary.totalReferencedAttachments,
        0,
      ),
    };
  }

  const [referenceSummary, storedAttachments, storedDraftAttachments] = await Promise.all([
    getAttachmentReferenceSummary(),
    getAllAttachmentBlobRecords(),
    getAllDraftAttachmentBlobRecords(),
  ]);
  return {
    ...referenceSummary,
    storedAttachments: storedAttachments.length,
    storedDraftAttachments: storedDraftAttachments.length,
    unreferencedStoredAttachments: Math.max(storedAttachments.length - referenceSummary.totalReferencedAttachments, 0),
  };
}

export async function cleanupOrphanedAttachments() {
  return shouldUseBackendAppStore()
    ? cleanupBackendOrphanAttachments()
    : cleanupOrphanAttachments();
}
