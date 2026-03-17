import { ref, type Ref } from 'vue';
import axios from 'axios';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { API_BASE } from '../config';
import { settings } from '../store/settings';
import { removeEditorAttachment } from '../utils/editorAttachments';

type UseEditorImagesOptions = {
  content: Ref<string>;
  previewRef: Ref<HTMLElement | null>;
  textareaRef: Ref<HTMLTextAreaElement | null>;
  showPreview: Ref<boolean>;
  handlePreviewInput: () => void;
  syncEditorPreview: () => Promise<void>;
};

const markdownPasteTurndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

markdownPasteTurndown.use(gfm);

export function useEditorImages(options: UseEditorImagesOptions) {
  const fileInput = ref<HTMLInputElement | null>(null);
  const isUploading = ref(false);
  const allowedTags = new Set([
    'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'EM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'I', 'LI', 'OL', 'P', 'PRE', 'S', 'STRONG', 'UL',
  ]);
  const blockTags = new Set(['DIV', 'P', 'BLOCKQUOTE', 'LI', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const textToHtml = (value: string) => {
    const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return normalized
      .split('\n')
      .map(escapeHtml)
      .join('<br>');
  };

  const wrapStyledInline = (html: string, element: HTMLElement) => {
    const style = (element.getAttribute('style') || '').toLowerCase();
    const className = element.className || '';
    let wrapped = html;

    if (/(font-weight\s*:\s*(bold|[6-9]00)|font:\s*[^;]*\b700\b)/.test(style) || className.includes('r-b88u0q')) {
      wrapped = `<strong>${wrapped}</strong>`;
    }
    if (/font-style\s*:\s*italic/.test(style)) {
      wrapped = `<em>${wrapped}</em>`;
    }
    if (/text-decoration[^;]*line-through|text-decoration-line\s*:\s*line-through/.test(style)) {
      wrapped = `<s>${wrapped}</s>`;
    }

    return wrapped;
  };

  const hasBlockChild = (element: HTMLElement) => {
    return Array.from(element.children).some((child) => blockTags.has(child.tagName.toUpperCase()));
  };

  const sanitizeNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return textToHtml(node.textContent || '');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toUpperCase();
    const childrenHtml = Array.from(element.childNodes).map(sanitizeNode).join('');

    if (tagName === 'DIV') {
      if (!childrenHtml) return '';
      const wrapped = wrapStyledInline(childrenHtml, element);
      return hasBlockChild(element) ? wrapped : `<p>${wrapped}</p>`;
    }

    if (tagName === 'IMG') {
      const alt = element.getAttribute('alt') || '';
      return escapeHtml(alt);
    }

    if (!allowedTags.has(tagName)) {
      if (!childrenHtml) return '';
      const wrapped = wrapStyledInline(childrenHtml, element);
      return blockTags.has(tagName) ? `<p>${wrapped}</p>` : wrapped;
    }

    if (tagName === 'A') {
      const href = element.getAttribute('href')?.trim() || '';
      if (!href) return childrenHtml;
      const safeHref = escapeHtml(href);
      return `<a href="${safeHref}" target="_blank" rel="noreferrer">${wrapStyledInline(childrenHtml, element)}</a>`;
    }

    const wrapped = wrapStyledInline(childrenHtml, element);
    return `<${tagName.toLowerCase()}>${wrapped}</${tagName.toLowerCase()}>`;
  };

  const sanitizePastedHtml = (html: string) => {
    const parser = new DOMParser();
    const document = parser.parseFromString(html, 'text/html');
    return Array.from(document.body.childNodes).map(sanitizeNode).join('');
  };

  const plainTextToHtml = (text: string) => {
    const normalized = text.replace(/\r\n/g, '\n');
    const paragraphs = normalized.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
    if (paragraphs.length === 0) {
      return normalized.split('\n').map(escapeHtml).join('<br>');
    }

    return paragraphs
      .map((paragraph) => `<p>${paragraph.split('\n').map(escapeHtml).join('<br>')}</p>`)
      .join('');
  };

  const insertHtmlAtCursor = (html: string) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const container = document.createElement('div');
    container.innerHTML = html;
    const fragment = document.createDocumentFragment();
    let lastNode: ChildNode | null = null;

    while (container.firstChild) {
      lastNode = fragment.appendChild(container.firstChild);
    }

    range.insertNode(fragment);

    if (lastNode) {
      const nextRange = document.createRange();
      nextRange.setStartAfter(lastNode);
      nextRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(nextRange);
    }

    return true;
  };

  const moveCaretToPreviewEnd = () => {
    const preview = options.previewRef.value;
    if (!preview) return;

    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(preview);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    preview.focus();
  };

  const htmlToMarkdown = (html: string) => {
    return markdownPasteTurndown.turndown(html).replace(/\n{3,}/g, '\n\n').trim();
  };

  const insertMarkdownAtCursor = (markdown: string) => {
    const textarea = options.textareaRef.value;
    if (!textarea) return false;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = options.content.value;
    options.content.value = `${current.slice(0, start)}${markdown}${current.slice(end)}`;

    requestAnimationFrame(() => {
      const cursor = start + markdown.length;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });

    return true;
  };

  const removeAttachedImage = (url: string) => {
    options.content.value = removeEditorAttachment(options.content.value, url);
    if (options.showPreview.value && options.previewRef.value) {
      void options.syncEditorPreview();
    }
  };

  const triggerImageUpload = () => {
    fileInput.value?.click();
  };

  const compressImage = (file: File) => {
    const mode = settings.editor.imageCompression;
    const compressibleTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (mode === 'original' || !compressibleTypes.includes(file.type)) {
      return Promise.resolve(file);
    }

    const maxWidth = mode === 'compact' ? 1280 : 1920;
    const outputType = file.type === 'image/png' ? 'image/png' : file.type;
    const quality = outputType === 'image/png' ? undefined : (mode === 'compact' ? 0.72 : 0.82);

    return new Promise<File>((resolve) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);

      image.onload = () => {
        const scale = Math.min(1, maxWidth / image.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext('2d');
        if (!context) {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
          return;
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }

          resolve(new File([blob], file.name, { type: blob.type || file.type, lastModified: file.lastModified }));
        }, outputType, quality);
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      };

      image.src = objectUrl;
    });
  };

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const uploadTarget = await compressImage(file);

    const formData = new FormData();
    formData.append('file', uploadTarget);

    try {
      isUploading.value = true;
      const res = await axios.post(`${API_BASE}/uploads/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const imageMarkdown = `\n![${uploadTarget.name}](${res.data.url})\n`;
      options.content.value += imageMarkdown;
      if (options.showPreview.value && options.previewRef.value) {
        await options.syncEditorPreview();
        requestAnimationFrame(() => options.previewRef.value?.focus());
      }
    } catch (err) {
      console.error('Failed to upload image', err);
    } finally {
      isUploading.value = false;
    }
  };

  const handleImageUpload = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      void uploadFile(target.files[0]);
      target.value = '';
    }
  };

  const handlePaste = (event: ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    let handledImagePaste = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          event.preventDefault();
          void uploadFile(file);
          handledImagePaste = true;
          break;
        }
      }
    }

    if (handledImagePaste) {
      return;
    }

    if (!options.showPreview.value) {
      const html = event.clipboardData?.getData('text/html') || '';
      const text = event.clipboardData?.getData('text/plain') || '';
      const markdown = html ? htmlToMarkdown(sanitizePastedHtml(html)) : text;

      if (!markdown) {
        return;
      }

      event.preventDefault();
      insertMarkdownAtCursor(markdown);
      return;
    }

    const html = event.clipboardData?.getData('text/html') || '';
    const text = event.clipboardData?.getData('text/plain') || '';
    const sanitizedHtml = html ? sanitizePastedHtml(html) : plainTextToHtml(text);

    if (!sanitizedHtml) {
      return;
    }

    event.preventDefault();
    if (!insertHtmlAtCursor(sanitizedHtml) && options.previewRef.value) {
      options.previewRef.value.focus();
      insertHtmlAtCursor(sanitizedHtml);
    }
    options.handlePreviewInput();
    void options.syncEditorPreview().then(() => {
      requestAnimationFrame(() => moveCaretToPreviewEnd());
    });
  };

  return {
    fileInput,
    handleImageUpload,
    handlePaste,
    isUploading,
    removeAttachedImage,
    triggerImageUpload,
  };
}
