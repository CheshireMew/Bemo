import { computed, watch, type Ref } from 'vue';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { settings } from '../store/settings';
import { extractOriginalRenderedUrl, renderMarkdownToHtml } from '../utils/markdownRenderer';
import { saveSettings } from '../services/localSettings';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

turndownService.use(gfm);
turndownService.addRule('preserveRenderedImages', {
  filter: 'img',
  replacement(_content, node) {
    const element = node as HTMLElement;
    const src = extractOriginalRenderedUrl(element.getAttribute('src') || '');
    const alt = element.getAttribute('alt') || '';
    if (!src) return '';
    return `![${alt}](${src})`;
  },
});
turndownService.addRule('preserveRenderedLinks', {
  filter: 'a',
  replacement(content, node) {
    const element = node as HTMLElement;
    const href = extractOriginalRenderedUrl(element.getAttribute('href') || '');
    if (!href) return content;
    return `[${content || href}](${href})`;
  },
});

type UseEditorRichTextOptions = {
  content: Ref<string>;
  previewRef: Ref<HTMLElement | null>;
  textareaRef: Ref<HTMLTextAreaElement | null>;
  showPreview: Ref<boolean>;
  isComposing: Ref<boolean>;
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
    options.previewRef.value.innerHTML = options.content.value ? await renderMarkdownToHtml(options.content.value) : '';
  };

  const handlePreviewInput = () => {
    if (options.isComposing.value) {
      return;
    }

    if (options.previewRef.value) {
      const textMarkdown = turndownService.turndown(options.previewRef.value.innerHTML);
      options.content.value = normalizeMarkdownSpacing(textMarkdown);
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
      options.previewRef.value.innerHTML = newVal ? await renderMarkdownToHtml(newVal) : '';
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
