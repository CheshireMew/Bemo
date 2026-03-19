import { marked } from 'marked';

import { settings } from '../store/settings.js';
import { resolveAttachmentUrl } from './attachmentUrls.js';

const ATTACHMENT_URL_PATTERN = /(\/images\/[^)\s"'`>]+)/g;
const ORIGINAL_URL_FRAGMENT = '#bemo-original=';

export function buildMarkedOptions() {
  const renderer = new marked.Renderer();
  renderer.image = ({ href, title, text }) => {
    const src = href || '';
    const titleAttr = title ? ` title="${title}"` : '';
    const altAttr = text || '';
    return `<img src="${src}" alt="${altAttr}"${titleAttr}>`;
  };
  renderer.link = ({ href, title, text }) => {
    const resolved = href || '';
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${resolved}"${titleAttr} target="_blank" rel="noreferrer">${text}</a>`;
  };

  return {
    gfm: settings.editor.markdownGfm,
    breaks: settings.editor.markdownBreaks,
    renderer,
  };
}

async function replaceAttachmentUrls(value: string) {
  const matches = Array.from(new Set(value.match(ATTACHMENT_URL_PATTERN) || []));
  if (matches.length === 0) {
    return value;
  }

  const replacements = new Map<string, string>();
  await Promise.all(matches.map(async (match) => {
    const resolved = await resolveAttachmentUrl(match);
    if (resolved && resolved !== match) {
      replacements.set(match, `${resolved}${ORIGINAL_URL_FRAGMENT}${encodeURIComponent(match)}`);
    } else {
      replacements.set(match, resolved || match);
    }
  }));

  return value.replace(ATTACHMENT_URL_PATTERN, (match) => replacements.get(match) || match);
}

export async function renderMarkdownToHtml(value: string) {
  const normalized = await replaceAttachmentUrls(value || '');
  return marked.parse(normalized, buildMarkedOptions());
}

export function extractOriginalRenderedUrl(value: string) {
  const markerIndex = value.indexOf(ORIGINAL_URL_FRAGMENT);
  if (markerIndex === -1) {
    return value;
  }

  try {
    return decodeURIComponent(value.slice(markerIndex + ORIGINAL_URL_FRAGMENT.length));
  } catch {
    return value;
  }
}
