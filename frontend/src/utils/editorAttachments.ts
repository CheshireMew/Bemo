export type EditorAttachment = {
  raw: string;
  label: string;
  url: string;
  kind: 'image' | 'file';
};

export type EditorImageAttachmentInput = {
  alt: string;
  url: string;
};

const ATTACHMENT_PATTERN = /(?:^|\n)(!\[([^\]]*)\]\((\/images\/[^)]+)\)|\[([^\]]*)\]\((\/images\/[^)]+)\))(?:\n|$)/g;

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

export function mergeEditorMarkdown(body: string, attachments: EditorAttachment[]): string {
  const parts = [
    body.trim(),
    ...attachments.map((attachment) => attachment.raw),
  ].filter(Boolean);

  return parts.join('\n\n');
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
