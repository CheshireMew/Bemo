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

export function contentAttachmentFilename(blobHash: string, filename: string) {
  const extension = filename.match(/\.[a-zA-Z0-9]{1,12}$/)?.[0].toLowerCase() || '';
  return `sha256-${blobHash.replace(/^sha256:/, '')}${extension}`;
}

export function rewriteAttachmentFilenames(content: string, names: ReadonlyMap<string, string>) {
  return content.replace(ATTACHMENT_URL_PATTERN, url => {
    const name = names.get(extractAttachmentFilename(url));
    return name ? buildAttachmentUrlFromFilename(name) : url;
  });
}
