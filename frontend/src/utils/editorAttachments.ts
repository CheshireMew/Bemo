export type EditorAttachment = {
  raw: string;
  label: string;
  url: string;
  kind: 'image' | 'file';
};

export type EditorAttachmentDisplayKind = 'image' | 'audio' | 'video' | 'file';

export type EditorImageAttachmentInput = {
  alt: string;
  url: string;
};

const ATTACHMENT_PATTERN = /(?:^|\n)(!\[([^\]]*)\]\(((?:\/images\/|data:|blob:)[^)]+)\)|\[([^\]]*)\]\(((?:\/images\/|data:|blob:)[^)]+)\))(?:\n|$)/g;
const ATTACHMENT_MARKER_PREFIX = 'BEMO_ATTACHMENT_MARKER_';

const normalizeSpacing = (value: string) => value
  .replace(/\n{3,}/g, '\n\n')
  .trim();

export function extractEditorAttachments(value: string): EditorAttachment[] {
  return Array.from(value.matchAll(ATTACHMENT_PATTERN)).map((match) => {
    const isImage = Boolean(match[3]);
    return {
      raw: match[1].trim(),
      label: isImage ? (match[2] || 'image') : (match[4] || 'attachment'),
      url: isImage ? match[3] : (match[5] || ''),
      kind: isImage ? 'image' : 'file',
    };
  });
}

export function splitEditorMarkdown(value: string) {
  const attachments = extractEditorAttachments(value);
  const body = normalizeSpacing(value.replace(ATTACHMENT_PATTERN, '\n'));
  return { body, attachments };
}

export function splitEditorMarkdownByKind(value: string) {
  const attachments = extractEditorAttachments(value);
  const imageSet = new Set(attachments.filter((attachment) => attachment.kind === 'image').map((attachment) => attachment.raw));

  const imageFreeBody = normalizeSpacing(value.replace(ATTACHMENT_PATTERN, (match) => (
    imageSet.has(match.trim()) ? '\n' : match
  )));
  const attachmentFreeBody = normalizeSpacing(value.replace(ATTACHMENT_PATTERN, '\n'));

  return {
    body: attachmentFreeBody,
    bodyWithoutImages: imageFreeBody,
    imageAttachments: attachments.filter((attachment) => attachment.kind === 'image'),
    fileAttachments: attachments.filter((attachment) => attachment.kind === 'file'),
    attachments,
  };
}

function getAttachmentExtension(value: string) {
  const normalized = value.split('?')[0]?.split('#')[0] || value;
  const dotIndex = normalized.lastIndexOf('.');
  if (dotIndex === -1) return '';
  return normalized.slice(dotIndex + 1).toLowerCase();
}

export function getEditorAttachmentDisplayKind(attachment: EditorAttachment): EditorAttachmentDisplayKind {
  if (attachment.kind === 'image') {
    return 'image';
  }

  const ext = getAttachmentExtension(attachment.url || attachment.label);
  if (['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus'].includes(ext)) {
    return 'audio';
  }
  if (['mp4', 'mov', 'mkv', 'webm', 'avi'].includes(ext)) {
    return 'video';
  }
  return 'file';
}

export function mergeEditorMarkdown(body: string, attachments: EditorAttachment[]): string {
  const parts = [
    body.trim(),
    ...attachments.map((attachment) => attachment.raw),
  ].filter(Boolean);

  return parts.join('\n\n');
}

export function replaceEditorAttachmentsWithMarkers(value: string) {
  const attachments = extractEditorAttachments(value);
  let index = 0;
  const body = normalizeSpacing(
    value.replace(ATTACHMENT_PATTERN, () => `\n\n${ATTACHMENT_MARKER_PREFIX}${index++}\n\n`),
  );
  return { body, attachments };
}

export function restoreEditorAttachmentMarkers(value: string, attachments: EditorAttachment[]) {
  let next = value;
  attachments.forEach((attachment, index) => {
    next = next.split(`${ATTACHMENT_MARKER_PREFIX}${index}`).join(attachment.raw);
  });
  return normalizeSpacing(next);
}

export function removeEditorAttachment(value: string, url: string): string {
  const attachments = extractEditorAttachments(value).filter((attachment) => attachment.url !== url);
  const { body } = splitEditorMarkdown(value);
  return mergeEditorMarkdown(body, attachments);
}

export function buildImageEditorAttachments(images: EditorImageAttachmentInput[]): EditorAttachment[] {
  return images.map((image) => ({
    raw: `![${image.alt}](${image.url})`,
    label: image.alt || 'image',
    url: image.url,
    kind: 'image',
  }));
}

export function mergeEditorMarkdownWithImages(body: string, images: EditorImageAttachmentInput[]): string {
  return mergeEditorMarkdown(body, buildImageEditorAttachments(images));
}

export function selectImageAttachmentInputs(attachments: EditorAttachment[]): EditorImageAttachmentInput[] {
  return attachments
    .filter((attachment) => attachment.kind === 'image')
    .map((attachment) => ({
      alt: attachment.label,
      url: attachment.url,
    }));
}
