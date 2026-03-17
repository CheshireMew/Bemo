import { marked } from 'marked';

import { resolveBackendUrl } from '../config';
import { settings } from '../store/settings';

export function buildMarkedOptions() {
  const renderer = new marked.Renderer();
  renderer.image = ({ href, title, text }) => {
    const src = resolveBackendUrl(href || '');
    const titleAttr = title ? ` title="${title}"` : '';
    const altAttr = text || '';
    return `<img src="${src}" alt="${altAttr}"${titleAttr}>`;
  };
  renderer.link = ({ href, title, text }) => {
    const resolved = href?.startsWith('/images/') ? resolveBackendUrl(href) : (href || '');
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${resolved}"${titleAttr} target="_blank" rel="noreferrer">${text}</a>`;
  };

  return {
    gfm: settings.editor.markdownGfm,
    breaks: settings.editor.markdownBreaks,
    renderer,
  };
}

export function renderMarkdownToHtml(value: string) {
  return marked.parse(value || '', buildMarkedOptions());
}
