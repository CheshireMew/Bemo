import type { Ref } from 'vue';

type UseEditorFormattingOptions = {
  content: Ref<string>;
  textareaRef: Ref<HTMLTextAreaElement | null>;
  previewRef: Ref<HTMLElement | null>;
  showPreview: Ref<boolean>;
  isComposing: Ref<boolean>;
  handlePreviewInput: () => void;
  togglePreview: () => void;
  clearFormatting: () => void | Promise<void>;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
  submit: () => void | Promise<void>;
};

export function useEditorFormatting(options: UseEditorFormattingOptions) {
  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const wrapSelectionInPreview = (tagName: string, placeholder = '') => {
    const selection = window.getSelection();
    const preview = options.previewRef.value;
    if (!selection || !preview || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!preview.contains(range.commonAncestorContainer)) return;

    const element = document.createElement(tagName);

    if (range.collapsed) {
      const textNode = document.createTextNode(placeholder);
      element.appendChild(textNode);
      range.insertNode(element);

      const nextRange = document.createRange();
      nextRange.setStart(textNode, 0);
      nextRange.setEnd(textNode, textNode.textContent?.length || 0);
      selection.removeAllRanges();
      selection.addRange(nextRange);
      return;
    }

    const fragment = range.extractContents();
    element.appendChild(fragment);
    range.insertNode(element);

    const nextRange = document.createRange();
    nextRange.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(nextRange);
  };

  const insertHtmlInPreview = (html: string) => {
    const selection = window.getSelection();
    const preview = options.previewRef.value;
    if (!selection || !preview || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!preview.contains(range.commonAncestorContainer)) return;

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
  };

  const insertListInPreview = (listTag: 'ul' | 'ol', placeholder: string) => {
    const selection = window.getSelection();
    const preview = options.previewRef.value;
    if (!selection || !preview || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!preview.contains(range.commonAncestorContainer)) return;

    const selectedText = selection.toString().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const items = (selectedText || placeholder)
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean);

    const html = `<${listTag}>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</${listTag}>`;
    insertHtmlInPreview(html);
  };

  const setPreviewCaret = (target: Node, offset = 0) => {
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.setStart(target, offset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    focusPreview();
  };

  const findClosestElement = (node: Node | null, tagName: string, root: HTMLElement | null) => {
    let current: Node | null = node;
    while (current && current !== root) {
      if (current instanceof HTMLElement && current.tagName === tagName) {
        return current;
      }
      current = current.parentNode;
    }
    return null;
  };

  const isPreviewListItemEmpty = (li: HTMLElement) => {
    const clone = li.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input').forEach((input) => input.remove());
    return !(clone.textContent || '').trim();
  };

  const handlePreviewEnterInList = () => {
    const selection = window.getSelection();
    const preview = options.previewRef.value;
    if (!selection || !preview || selection.rangeCount === 0 || !selection.isCollapsed) {
      return false;
    }

    const range = selection.getRangeAt(0);
    if (!preview.contains(range.startContainer)) {
      return false;
    }

    const li = findClosestElement(range.startContainer, 'LI', preview);
    if (!(li instanceof HTMLElement)) {
      return false;
    }

    const list = li.parentElement;
    if (!(list instanceof HTMLOListElement || list instanceof HTMLUListElement)) {
      return false;
    }

    if (isPreviewListItemEmpty(li)) {
      const paragraph = document.createElement('p');
      const breakNode = document.createElement('br');
      paragraph.appendChild(breakNode);
      list.parentNode?.insertBefore(paragraph, list.nextSibling);
      li.remove();
      if (!list.querySelector('li')) {
        list.remove();
      }

      options.handlePreviewInput();
      setPreviewCaret(paragraph, 0);
      return true;
    }

    const nextLi = document.createElement('li');
    const checkbox = li.querySelector('input[type="checkbox"]');
    if (checkbox instanceof HTMLInputElement) {
      const nextCheckbox = document.createElement('input');
      nextCheckbox.type = 'checkbox';
      nextLi.appendChild(nextCheckbox);
      nextLi.appendChild(document.createTextNode(' '));
    } else {
      nextLi.appendChild(document.createElement('br'));
    }

    list.insertBefore(nextLi, li.nextSibling);
    options.handlePreviewInput();

    const textNode = Array.from(nextLi.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    if (textNode) {
      setPreviewCaret(textNode, textNode.textContent?.length || 0);
    } else {
      setPreviewCaret(nextLi, nextLi.childNodes.length);
    }
    return true;
  };

  const handleMarkdownEnterInList = () => {
    const el = options.textareaRef.value;
    if (!el || el.selectionStart !== el.selectionEnd) return false;

    const cursor = el.selectionStart;
    const text = options.content.value;
    const lineStart = text.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1;
    const lineEnd = text.indexOf('\n', cursor);
    const currentLineEnd = lineEnd === -1 ? text.length : lineEnd;
    const line = text.slice(lineStart, currentLineEnd);

    const checklistMatch = line.match(/^(\s*)-\s+\[( |x|X)\]\s*(.*)$/);
    if (checklistMatch) {
      const [, indent, , body] = checklistMatch;
      if (!body.trim()) {
        options.content.value = `${text.slice(0, lineStart)}${text.slice(currentLineEnd + (lineEnd === -1 ? 0 : 1))}`;
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(lineStart, lineStart);
        });
        return true;
      }

      const insertion = `\n${indent}- [ ] `;
      options.content.value = `${text.slice(0, cursor)}${insertion}${text.slice(cursor)}`;
      const nextCursor = cursor + insertion.length;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      });
      return true;
    }

    const orderedMatch = line.match(/^(\s*)(\d+)\.\s*(.*)$/);
    if (orderedMatch) {
      const [, indent, rawNumber, body] = orderedMatch;
      if (!body.trim()) {
        options.content.value = `${text.slice(0, lineStart)}${text.slice(currentLineEnd + (lineEnd === -1 ? 0 : 1))}`;
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(lineStart, lineStart);
        });
        return true;
      }

      const insertion = `\n${indent}${Number(rawNumber) + 1}. `;
      options.content.value = `${text.slice(0, cursor)}${insertion}${text.slice(cursor)}`;
      const nextCursor = cursor + insertion.length;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      });
      return true;
    }

    const unorderedMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (unorderedMatch) {
      const [, indent, body] = unorderedMatch;
      if (!body.trim()) {
        options.content.value = `${text.slice(0, lineStart)}${text.slice(currentLineEnd + (lineEnd === -1 ? 0 : 1))}`;
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(lineStart, lineStart);
        });
        return true;
      }

      const insertion = `\n${indent}- `;
      options.content.value = `${text.slice(0, cursor)}${insertion}${text.slice(cursor)}`;
      const nextCursor = cursor + insertion.length;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
      });
      return true;
    }

    return false;
  };

  const transformSelectedLines = (transform: (line: string, index: number) => string) => {
    const el = options.textareaRef.value;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = options.content.value;
    const blockStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const nextNewline = text.indexOf('\n', end);
    const blockEnd = nextNewline === -1 ? text.length : nextNewline;
    const selectedBlock = text.slice(blockStart, blockEnd);
    const lines = selectedBlock.split('\n');
    const transformed = lines.map((line, index) => transform(line, index)).join('\n');

    options.content.value = `${text.slice(0, blockStart)}${transformed}${text.slice(blockEnd)}`;

    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = blockStart;
      el.selectionEnd = blockStart + transformed.length;
    });
  };

  const wrapSelection = (prefix: string, suffix: string, placeholder: string = '') => {
    const el = options.textareaRef.value;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = options.content.value;
    const selected = text.substring(start, end);

    const insertText = selected || placeholder;
    const newText = text.substring(0, start) + prefix + insertText + suffix + text.substring(end);
    options.content.value = newText;

    requestAnimationFrame(() => {
      el.focus();
      if (selected) {
        el.selectionStart = el.selectionEnd = start + prefix.length + selected.length + suffix.length;
      } else {
        el.selectionStart = start + prefix.length;
        el.selectionEnd = start + prefix.length + placeholder.length;
      }
    });
  };

  const insertAtLineStart = (prefix: string) => {
    transformSelectedLines((line) => `${prefix}${line}`);
  };

  const focusPreview = () => {
    options.previewRef.value?.focus();
  };

  const insertBold = () => {
    if (options.showPreview.value) {
      wrapSelectionInPreview('strong', '粗体文字');
      options.handlePreviewInput();
      focusPreview();
      return;
    }
    wrapSelection('**', '**', '粗体文字');
  };

  const insertItalic = () => {
    if (options.showPreview.value) {
      wrapSelectionInPreview('em', '斜体文字');
      options.handlePreviewInput();
      focusPreview();
      return;
    }
    wrapSelection('*', '*', '斜体文字');
  };

  const insertStrikethrough = () => {
    if (options.showPreview.value) {
      wrapSelectionInPreview('s', '删除线');
      options.handlePreviewInput();
      focusPreview();
      return;
    }
    wrapSelection('~~', '~~', '删除线');
  };

  const insertLink = () => {
    if (options.showPreview.value) {
      const url = prompt('请输入链接地址:', 'https://');
      if (url) {
        const selection = window.getSelection();
        const selected = selection?.toString() || '';
        const safeUrl = url.replace(/"/g, '&quot;');
        const safeText = (selected || '链接文字')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        insertHtmlInPreview(`<a href="${safeUrl}" target="_blank" rel="noreferrer">${safeText}</a>`);
        options.handlePreviewInput();
        focusPreview();
      }
      return;
    }
    wrapSelection('[', '](url)', '链接文字');
  };

  const insertCode = () => {
    if (options.showPreview.value) {
      const sel = window.getSelection();
      if (sel && sel.toString()) {
        const safeText = sel.toString()
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        insertHtmlInPreview(`<code>${safeText}</code>`);
      } else {
        wrapSelectionInPreview('code', 'code');
      }
      options.handlePreviewInput();
      focusPreview();
      return;
    }
    wrapSelection('`', '`', 'code');
  };

  const insertList = () => {
    if (options.showPreview.value) {
      insertListInPreview('ul', '列表项');
      options.handlePreviewInput();
      focusPreview();
      return;
    }
    insertAtLineStart('- ');
  };

  const insertOrderedList = () => {
    if (options.showPreview.value) {
      insertListInPreview('ol', '列表项');
      options.handlePreviewInput();
      focusPreview();
      return;
    }
    transformSelectedLines((line, index) => `${index + 1}. ${line}`);
  };

  const insertChecklist = () => {
    if (options.showPreview.value && options.previewRef.value) {
      const li = document.createElement('li');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      li.appendChild(cb);
      li.appendChild(document.createTextNode(' 待办事项'));
      const ul = document.createElement('ul');
      ul.appendChild(li);

      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(ul);
        range.setStartAfter(ul);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        options.previewRef.value.appendChild(ul);
      }
      options.handlePreviewInput();
      focusPreview();
      return;
    }
    insertAtLineStart('- [ ] 待办事项');
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.isComposing || options.isComposing.value) {
      return;
    }

    const isCtrl = e.ctrlKey || e.metaKey;

    if (!isCtrl && e.key === 'Enter') {
      const handled = options.showPreview.value ? handlePreviewEnterInList() : handleMarkdownEnterInList();
      if (handled) {
        e.preventDefault();
      }
      return;
    }

    if (isCtrl && !e.shiftKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          insertBold();
          break;
        case 'i':
          e.preventDefault();
          insertItalic();
          break;
        case 'k':
          e.preventDefault();
          insertLink();
          break;
        case '`':
          e.preventDefault();
          insertCode();
          break;
        case '\\':
          e.preventDefault();
          void options.clearFormatting();
          break;
        case 'z':
          e.preventDefault();
          void options.undo();
          break;
        case 'y':
          e.preventDefault();
          void options.redo();
          break;
        case 'enter':
          e.preventDefault();
          void options.submit();
          break;
      }
    }

    if (isCtrl && e.shiftKey) {
      switch (e.key.toLowerCase()) {
        case 'z':
          e.preventDefault();
          void options.redo();
          break;
        case 'x':
          e.preventDefault();
          insertStrikethrough();
          break;
        case 'l':
          e.preventDefault();
          insertList();
          break;
        case 'o':
          e.preventDefault();
          insertOrderedList();
          break;
        case 't':
          e.preventDefault();
          insertChecklist();
          break;
      }
    }

    if (isCtrl && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      options.togglePreview();
    }
  };

  return {
    handleKeydown,
    insertBold,
    insertChecklist,
    insertCode,
    insertItalic,
    insertLink,
    insertList,
    insertOrderedList,
    insertStrikethrough,
  };
}
