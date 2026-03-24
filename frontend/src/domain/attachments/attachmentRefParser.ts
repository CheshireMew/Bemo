import { extractAttachmentFilename, extractAttachmentUrlsFromContent } from './attachmentLinks.js';

export function extractAttachmentFilenames(content: string): string[] {
  const filenames = new Set<string>();
  for (const url of extractAttachmentUrlsFromContent(content || '')) {
    const filename = extractAttachmentFilename(url);
    if (filename) {
      filenames.add(filename);
    }
  }
  return [...filenames];
}
