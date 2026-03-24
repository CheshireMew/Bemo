import { buildAttachmentUrlFromFilename } from './attachmentLinks.js';

function sanitizeFilename(filename: string) {
  const trimmed = filename.trim();
  const normalized = trimmed.normalize('NFKC').replace(/[\\/:*?"<>|]/g, '-');
  return normalized || 'attachment.bin';
}

export function buildLocalAttachmentPath(filename: string) {
  return buildAttachmentUrlFromFilename(filename);
}

export function createLocalAttachmentFilename(filename: string) {
  const dotIndex = filename.lastIndexOf('.');
  const hasExtension = dotIndex > 0 && dotIndex < filename.length - 1;
  const base = hasExtension ? filename.slice(0, dotIndex) : filename;
  const extension = hasExtension ? filename.slice(dotIndex) : '';
  const safeBase = sanitizeFilename(base || 'attachment');
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeBase}${extension}`;
}
