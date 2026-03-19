import type { Ref } from 'vue';

export function useEditorPreviewFormatting(options: {
  previewRef: Ref<HTMLElement | null>;
  handlePreviewInput: () => void;
}) {
  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const focusPreview = () => {
    options.previewRef.value?.focus();
  };

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

  const insertPreviewChecklist = () => {
    if (!options.previewRef.value) return;
    const li = document.createElement('li');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    li.appendChild(checkbox);
    li.appendChild(document.createTextNode(' 待办事项'));
    const ul = document.createElement('ul');
    ul.appendChild(li);

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(ul);
      range.setStartAfter(ul);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      options.previewRef.value.appendChild(ul);
    }
  };

  return {
    focusPreview,
    handlePreviewEnterInList,
    insertHtmlInPreview,
    insertListInPreview,
    insertPreviewChecklist,
    wrapSelectionInPreview,
  };
}
