import { resolveBackendUrl } from '../config.js';
import { getAttachmentBlobRecord, getDraftAttachmentBlobRecord } from './db.js';

type CachedAttachmentUrl = {
  objectUrl: string;
  updatedAt: number;
};

const objectUrlCache = new Map<string, CachedAttachmentUrl>();

function isDirectUrl(url: string) {
  return /^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:');
}

export function extractAttachmentFilename(url: string) {
  if (!url.startsWith('/images/')) return '';
  return decodeURIComponent(url.replace(/^\/images\//, ''));
}

function revokeObjectUrl(url: string) {
  if (typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url);
  }
}

export function clearAttachmentUrlCache(filename?: string) {
  if (filename) {
    const cached = objectUrlCache.get(filename);
    if (!cached) return;
    revokeObjectUrl(cached.objectUrl);
    objectUrlCache.delete(filename);
    return;
  }

  for (const cached of objectUrlCache.values()) {
    revokeObjectUrl(cached.objectUrl);
  }
  objectUrlCache.clear();
}

export async function resolveAttachmentUrl(url: string): Promise<string> {
  if (!url) return url;
  if (isDirectUrl(url)) return url;

  const filename = extractAttachmentFilename(url);
  if (!filename) {
    return resolveBackendUrl(url);
  }

  const record = await getAttachmentBlobRecord(filename);
  const draftRecord = record ? null : await getDraftAttachmentBlobRecord(filename);
  const resolvedRecord = record || draftRecord;
  const cached = objectUrlCache.get(filename);
  if (!resolvedRecord) {
    if (cached) {
      revokeObjectUrl(cached.objectUrl);
      objectUrlCache.delete(filename);
    }
    return resolveBackendUrl(url);
  }

  if (cached?.updatedAt === resolvedRecord.updatedAt) {
    return cached.objectUrl;
  }

  if (cached) {
    revokeObjectUrl(cached.objectUrl);
  }

  const objectUrl = URL.createObjectURL(resolvedRecord.blob);
  objectUrlCache.set(filename, {
    objectUrl,
    updatedAt: resolvedRecord.updatedAt,
  });
  return objectUrl;
}
