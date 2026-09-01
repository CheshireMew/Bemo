import { marked } from 'marked';
import DOMPurify from 'dompurify';

import { settings } from '../store/settings.js';
import { resolveAttachmentUrl } from '../domain/attachments/attachmentUrlResolver.js';

const ATTACHMENT_URL_PATTERN = /(\/images\/[^)\s"'`>]+)/g;
const ORIGINAL_URL_FRAGMENT = '#bemo-original=';

function escapeAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildMarkedOptions() {
  const renderer = new marked.Renderer();
  renderer.image = ({ href, title, text }) => {
    const src = escapeAttribute(href || '');
    const titleAttr = title ? ` title="${escapeAttribute(title)}"` : '';
    const altAttr = escapeAttribute(text || '');
    return `<img src="${src}" alt="${altAttr}"${titleAttr}>`;
  };
  renderer.link = function ({ href, title, tokens }) {
    const resolved = escapeAttribute(href || '');
    const titleAttr = title ? ` title="${escapeAttribute(title)}"` : '';
    return `<a href="${resolved}"${titleAttr} target="_blank" rel="noopener noreferrer">${this.parser.parseInline(tokens)}</a>`;
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
  const html = await marked.parse(normalized, buildMarkedOptions());
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true }, ADD_ATTR: ['target'],
    FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style', 'srcset'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.:\-]|$))/i,
  });
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
