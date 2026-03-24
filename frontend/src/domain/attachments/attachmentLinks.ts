const ATTACHMENT_URL_PATTERN = /(\/images\/[^)\s"'`>]+)/g;

export function extractAttachmentFilename(url: string) {
  if (!url.startsWith('/images/')) return '';
  return decodeURIComponent(url.replace(/^\/images\//, ''));
}

export function extractAttachmentUrlsFromContent(content: string): string[] {
  const matches = content.match(ATTACHMENT_URL_PATTERN) || [];
  return Array.from(new Set(matches));
}

export function buildAttachmentUrlFromFilename(filename: string) {
  return `/images/${encodeURIComponent(filename)}`;
}
