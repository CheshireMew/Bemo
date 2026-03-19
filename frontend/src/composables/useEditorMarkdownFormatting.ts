import type { Ref } from 'vue';

export function useEditorMarkdownFormatting(options: {
  content: Ref<string>;
  textareaRef: Ref<HTMLTextAreaElement | null>;
}) {
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

  const wrapSelection = (prefix: string, suffix: string, placeholder = '') => {
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

  return {
    handleMarkdownEnterInList,
    insertAtLineStart,
    transformSelectedLines,
    wrapSelection,
  };
}
