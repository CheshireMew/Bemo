import { computed, watch, type Ref } from 'vue';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { settings } from '../store/settings';
import {
  type EditorAttachment,
  mergeEditorMarkdown,
  splitEditorMarkdown,
} from '../utils/editorAttachments';
import { renderMarkdownToHtml } from '../utils/markdownRenderer';
import { saveSettings } from '../services/localSettings';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

turndownService.use(gfm);

type UseEditorRichTextOptions = {
  content: Ref<string>;
  previewRef: Ref<HTMLElement | null>;
  textareaRef: Ref<HTMLTextAreaElement | null>;
  showPreview: Ref<boolean>;
  isComposing: Ref<boolean>;
  attachments: Ref<EditorAttachment[]>;
};

export function useEditorRichText(options: UseEditorRichTextOptions) {
  const normalizeMarkdownSpacing = (value: string) => {
    const segments = value.split(/(```[\s\S]*?```)/g);

    return segments
      .map((segment, index) => {
        if (index % 2 === 1) {
          return segment;
        }

        return segment
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n');
      })
      .join('')
      .trim();
  };

  const syncEditorPreview = async () => {
    if (!options.previewRef.value) return;
    const { body: displayContent } = splitEditorMarkdown(options.content.value);
    options.previewRef.value.innerHTML = displayContent ? await renderMarkdownToHtml(displayContent) : '';
  };

  const mergeTextAndAttachments = (textMarkdown: string) => {
    const normalizedText = normalizeMarkdownSpacing(textMarkdown);
    return mergeEditorMarkdown(normalizedText, options.attachments.value);
  };

  const handlePreviewInput = () => {
    if (options.isComposing.value) {
      return;
    }

    if (options.previewRef.value) {
      const textMarkdown = turndownService.turndown(options.previewRef.value.innerHTML);
      options.content.value = mergeTextAndAttachments(textMarkdown);
    }
  };

  const handleCompositionEnd = () => {
    options.isComposing.value = false;
    if (options.showPreview.value) {
      handlePreviewInput();
    }
  };

  const persistEditorModePreference = () => {
    settings.editor.preferredMode = options.showPreview.value ? 'rich-text' : 'markdown';
    saveSettings();
  };

  const togglePreview = () => {
    options.showPreview.value = !options.showPreview.value;
    persistEditorModePreference();
    if (!options.showPreview.value) {
      requestAnimationFrame(() => options.textareaRef.value?.focus());
    } else if (options.previewRef.value) {
      void syncEditorPreview().then(() => {
        requestAnimationFrame(() => options.previewRef.value?.focus());
      });
    }
  };

  const hasContent = computed(() => {
    if (options.showPreview.value) {
      return !!(options.previewRef.value?.textContent?.trim()) || !!options.content.value.trim();
    }
    return !!options.content.value.trim();
  });

  watch(options.content, async (newVal) => {
    if (!options.showPreview.value && options.previewRef.value) {
      const { body: displayContent } = splitEditorMarkdown(newVal);
      options.previewRef.value.innerHTML = displayContent ? await renderMarkdownToHtml(displayContent) : '';
    }
  });

  watch(() => [settings.editor.markdownGfm, settings.editor.markdownBreaks], async () => {
    if (options.showPreview.value && options.previewRef.value) {
      await syncEditorPreview();
    }
  });

  return {
    handleCompositionEnd,
    handlePreviewInput,
    hasContent,
    normalizeMarkdownSpacing,
    syncEditorPreview,
    togglePreview,
  };
}
