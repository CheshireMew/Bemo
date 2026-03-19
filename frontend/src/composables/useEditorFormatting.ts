import type { Ref } from 'vue';
import { useEditorMarkdownFormatting } from './useEditorMarkdownFormatting.js';
import { useEditorPreviewFormatting } from './useEditorPreviewFormatting.js';

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
  const {
    focusPreview,
    handlePreviewEnterInList,
    insertHtmlInPreview,
    insertListInPreview,
    insertPreviewChecklist,
    wrapSelectionInPreview,
  } = useEditorPreviewFormatting({
    previewRef: options.previewRef,
    handlePreviewInput: options.handlePreviewInput,
  });

  const {
    handleMarkdownEnterInList,
    insertAtLineStart,
    transformSelectedLines,
    wrapSelection,
  } = useEditorMarkdownFormatting({
    content: options.content,
    textareaRef: options.textareaRef,
  });

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
      insertPreviewChecklist();
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
