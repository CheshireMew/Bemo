<template>
  <Teleport to="body">
    <div v-if="open" class="share-overlay" @click.self="close">
      <section v-modal-focus="close" class="share-panel" role="dialog" aria-modal="true" aria-label="分享笔记图片">
        <header class="share-header">
          <h2>分享笔记图片</h2>
          <button type="button" class="close-btn" aria-label="关闭图片分享" @click="close"><X :size="20" /></button>
        </header>
        <div class="layout-toolbar">
          <div class="layout-options" role="group" aria-label="分享图片版式">
            <button
              v-for="layout in layouts"
              :key="layout.id"
              type="button"
              class="layout-option"
              :class="{ selected: selectedLayout === layout.id }"
              :aria-pressed="selectedLayout === layout.id"
              :title="layout.description"
              :disabled="sending"
              @click="selectedLayout = layout.id"
            >
              <span class="layout-swatch" :class="`swatch-${layout.id}`" aria-hidden="true">
                <span class="swatch-meta"></span><span class="swatch-body"><i></i><i></i><i></i></span><span class="swatch-footer"></span>
              </span>
              <span>{{ layout.label }}</span>
            </button>
          </div>
          <p class="layout-caption">{{ selectedDescription }}</p>
        </div>
        <div class="share-preview surface-scroll" :aria-busy="generating">
          <div v-if="generating" class="share-status" role="status">正在生成图片…</div>
          <div v-else-if="generationError" class="share-status" role="alert">
            <p>{{ generationError }}</p>
            <button type="button" class="secondary-btn" @click="generateImage">重新生成</button>
          </div>
          <img v-else-if="imageUrl" :src="imageUrl" alt="笔记分享图片预览" class="share-image" />
        </div>
        <footer class="share-footer">
          <p v-if="actionError" class="action-error" role="alert">{{ actionError }}</p>
          <button v-if="canShare" type="button" class="primary-btn" :disabled="!imageBlob || sending" @click="shareImage">
            <Share2 :size="18" />{{ sending ? '正在打开分享…' : '分享图片' }}
          </button>
          <button v-if="!isMobile" type="button" :class="canShare ? 'secondary-btn' : 'primary-btn'" :disabled="!imageBlob || sending" @click="saveImage">
            <Download :size="18" />保存图片
          </button>
        </footer>
      </section>
    </div>
    <div v-if="open" class="share-render-stage" aria-hidden="true" inert>
      <article ref="renderCard" class="share-render-card" :class="`layout-${selectedLayout}`" :data-layout="selectedLayout">
        <div class="image-sheet">
          <header class="image-masthead">
            <div class="image-brand"><span class="brand-mark" aria-hidden="true"></span><span>Bemo</span></div>
            <time class="image-header-date">{{ dateLabel }}</time>
          </header>
          <div class="image-content">
            <aside v-if="selectedLayout === 'column'" class="image-date-column">
              <span>{{ dateLabel.slice(0, 7).replace('-', '.') }}</span>
              <strong>{{ dateLabel.slice(8, 10) }}</strong>
              <span>{{ dateLabel.slice(11) }}</span>
            </aside>
            <div class="image-main">
              <div class="markdown-body image-body" v-html="shareHtml"></div>
              <div v-if="shareAttachments.length" class="image-attachments">
                <template v-for="attachment in shareAttachments" :key="attachment.url">
                  <img v-if="attachment.image" :src="attachment.url" :alt="attachment.label" />
                  <div v-else class="image-file"><Paperclip :size="16" /><span>{{ attachment.label }}</span></div>
                </template>
              </div>
            </div>
          </div>
          <footer class="image-footer">
            <div v-if="note.tags.length" class="image-tags"><span v-for="tag in note.tags" :key="tag">#{{ tag }}</span></div>
            <span v-else class="image-signature">Bemo · 记录此刻</span>
            <time class="image-footer-date">{{ dateLabel }}</time>
          </footer>
        </div>
      </article>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { Download, Paperclip, Share2, X } from 'lucide-vue-next';
import type { NoteMeta } from '../../../store/notes';
import { formatNoteDate } from '../../../composables/useNoteCard';
import { useMobileBackHandler } from '../../../composables/useMobileBackHandler';
import { useScrollLock } from '../../../composables/useScrollLock';
import { vModalFocus } from '../../../directives/modalFocus';
import { resolveAttachmentUrl } from '../../../domain/attachments/attachmentUrlResolver';
import { downloadBlob } from '../../../domain/importExport/importExportShared';
import { canShareImageFile, shareImageFile } from '../../../domain/runtime/nativePlatformBridge';
import { isMobileProductShell } from '../../../domain/runtime/shellRuntime';
import { renderMarkdownToHtml } from '../../../utils/markdownRenderer';
import { splitEditorMarkdownByKind } from '../../../utils/editorAttachments';

const props = defineProps<{ open: boolean; note: NoteMeta }>();
const emit = defineEmits<{ close: [] }>();
const open = computed(() => props.open);
const isMobile = isMobileProductShell();
const layouts = [
  { id: 'minimal', label: '留白', description: '细线、留白与清晰的文字层次' },
  { id: 'paper', label: '书页', description: '衬线字体与书页式排版' },
  { id: 'night', label: '夜读', description: '深色底、柔和蓝光与侧边引导线' },
  { id: 'column', label: '专栏', description: '日期侧栏与杂志式分栏' },
] as const;
type LayoutId = typeof layouts[number]['id'];
const savedLayout = localStorage.getItem('bemo.note-image-layout');
const selectedLayout = ref<LayoutId>(layouts.some(layout => layout.id === savedLayout) ? savedLayout as LayoutId : 'minimal');
const selectedDescription = computed(() => layouts.find(layout => layout.id === selectedLayout.value)?.description);
const dateLabel = computed(() => formatNoteDate(props.note.created_at));
const fileName = computed(() => `Bemo-${dateLabel.value.replace(/[: ]/g, '-')}-${props.note.note_id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12)}-${selectedLayout.value}.png`);
const renderCard = ref<HTMLElement | null>(null);
const shareHtml = ref('');
const shareAttachments = ref<Array<{ url: string; label: string; image: boolean }>>([]);
const imageBlob = shallowRef<Blob | null>(null);
const imageUrl = ref('');
const generating = ref(false);
const sending = ref(false);
const generationError = ref('');
const actionError = ref('');
const canShare = ref(isMobile);
let generation = 0;
let imageRequest: AbortController | null = null;

const close = () => emit('close');
const releaseImage = () => {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
  imageUrl.value = '';
  imageBlob.value = null;
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('图片读取失败，请重试。'));
  reader.readAsDataURL(blob);
});

const generateImage = async () => {
  const current = ++generation;
  imageRequest?.abort();
  const request = new AbortController();
  imageRequest = request;
  const timeout = setTimeout(() => request.abort(), 20000);
  generating.value = true;
  generationError.value = '';
  actionError.value = '';
  releaseImage();
  try {
    const { body, attachments } = splitEditorMarkdownByKind(props.note.content || '');
    const [html, resolvedAttachments] = await Promise.all([
      renderMarkdownToHtml(body),
      Promise.all(attachments.map(async attachment => ({
        url: attachment.kind === 'image' ? await resolveAttachmentUrl(attachment.url) : attachment.url,
        label: attachment.label,
        image: attachment.kind === 'image',
      }))),
    ]);
    if (current !== generation || !props.open) return;
    shareHtml.value = html;
    shareAttachments.value = resolvedAttachments;
    await nextTick();
    const card = renderCard.value;
    if (!card) return;
    await Promise.all(Array.from(card.querySelectorAll('img')).map(async image => {
      // Embed image bytes before capture so an unavailable image cannot silently disappear.
      const response = await fetch(image.src, { signal: request.signal });
      if (!response.ok) throw new Error('笔记中的图片加载失败，请重试。');
      image.src = await blobToDataUrl(await response.blob());
      await image.decode();
    }));
    await document.fonts.ready;
    if (current !== generation || !props.open) return;
    const { toBlob } = await import('html-to-image');
    const blob = await toBlob(card, { pixelRatio: 2, fontEmbedCSS: '', includeQueryParams: true });
    if (current !== generation || !props.open) return;
    if (!blob || blob.size === 0) throw new Error('图片生成失败，请重试。');
    imageBlob.value = blob;
    imageUrl.value = URL.createObjectURL(blob);
    canShare.value = canShareImageFile(blob, fileName.value);
  } catch (error) {
    if (current !== generation || !props.open) return;
    generationError.value = request.signal.aborted ? '图片生成超时，请重试。' : (error instanceof Error ? error.message : '图片生成失败，请重试。');
  } finally {
    clearTimeout(timeout);
    if (current === generation) generating.value = false;
  }
};

const shareImage = async () => {
  if (!imageBlob.value || sending.value) return;
  sending.value = true;
  actionError.value = '';
  try {
    await shareImageFile({ blob: imageBlob.value, fileName: fileName.value, title: props.note.title || 'Bemo 笔记' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!(error instanceof DOMException && error.name === 'AbortError') && !/cancel|dismiss|取消/i.test(message)) {
      actionError.value = '分享失败，请重试。';
    }
  } finally {
    sending.value = false;
  }
};

const saveImage = async () => {
  if (!imageBlob.value || sending.value) return;
  actionError.value = '';
  try {
    await downloadBlob(imageBlob.value, fileName.value, 'image/png');
  } catch {
    actionError.value = '图片保存失败，请重试。';
  }
};

watch(selectedLayout, layout => localStorage.setItem('bemo.note-image-layout', layout));
watch(() => [props.open, props.note.note_id, props.note.content, props.note.tags, props.note.created_at, selectedLayout.value], () => {
  if (props.open) {
    void generateImage();
  } else {
    generation++;
    imageRequest?.abort();
    releaseImage();
  }
}, { immediate: true });
useScrollLock(open);
useMobileBackHandler({ id: `note-image-share:${props.note.note_id}`, priority: 680, enabled: open, dismiss: close });
onBeforeUnmount(() => {
  generation++;
  imageRequest?.abort();
  releaseImage();
});
</script>

<style scoped>
.share-overlay {
  position: fixed; inset: 0; z-index: 430; display: flex; align-items: center; justify-content: center;
  padding: max(16px, var(--safe-top)) max(16px, var(--safe-right)) max(16px, var(--safe-bottom)) max(16px, var(--safe-left));
  background: var(--overlay-color);
}
.share-panel {
  display: flex; flex-direction: column; width: min(100%, 620px); max-height: 100%; overflow: hidden;
  border: 1px solid var(--border-color); border-radius: var(--radius-xl); background: var(--bg-card); color: var(--text-primary);
  box-shadow: var(--shadow-dialog);
}
.share-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; }
.share-header h2 { font-size: 16px; font-weight: 600; }
.close-btn { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 0; border: none; border-radius: 8px; background: transparent; color: var(--text-secondary); cursor: pointer; }
.close-btn:hover { background: var(--surface-hover); }
.layout-toolbar { flex-shrink: 0; padding: 0 18px 14px; border-bottom: 1px solid var(--border-color); }
.layout-options { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.layout-option { display: flex; min-width: 0; flex-direction: column; align-items: center; gap: 7px; padding: 8px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-card); color: var(--text-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.layout-option:hover { background: var(--surface-hover); }
.layout-option.selected { border-color: var(--accent-color); background: var(--accent-sidebar-bg); color: var(--accent-text); }
.layout-caption { margin-top: 10px; font-size: 12px; line-height: 1.5; color: var(--text-secondary); }
.layout-swatch { display: flex; flex-direction: column; width: 100%; height: 52px; padding: 7px 10px; border-radius: 4px; background: #f4f6f9; color: #6b7584; }
.swatch-meta { width: 32%; height: 3px; margin-bottom: 6px; background: currentColor; }
.swatch-body { display: grid; gap: 3px; }
.swatch-body i { height: 2px; background: currentColor; opacity: 0.6; }
.swatch-body i:last-child { width: 75%; }
.swatch-footer { width: 20%; height: 2px; margin-top: auto; background: currentColor; opacity: 0.5; }
.swatch-minimal { border: 5px solid #e9edf2; background: #fff; padding: 4px 6px; }
.swatch-paper { background: #fafbfc; border-top: 2px solid #80878e; border-bottom: 2px solid #80878e; }
.swatch-paper .swatch-meta { align-self: center; }
.swatch-paper .swatch-footer { align-self: flex-end; }
.swatch-night { background: linear-gradient(120deg, #17212f, #253d53); color: #d9e5f2; }
.swatch-night .swatch-body { border-left: 2px solid #8bb3bf; padding-left: 5px; }
.swatch-column { position: relative; padding-left: 25px; background: #edf0f5; }
.swatch-column::before { content: '29'; position: absolute; top: 13px; left: 5px; color: #b55543; font-size: 12px; font-weight: 700; }
.share-preview { min-height: 120px; min-width: 0; overflow: auto; padding: 18px; background: var(--surface-muted); overscroll-behavior: contain; }
.share-image { display: block; width: 100%; height: auto; box-shadow: 0 5px 20px rgba(28, 39, 55, 0.08); }
.share-status { display: flex; min-height: 180px; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--text-secondary); }
.share-footer { flex-shrink: 0; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; padding: 12px 18px; border-top: 1px solid var(--border-color); background: var(--bg-card); }
.primary-btn, .secondary-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; padding: 8px 16px; border: 1px solid var(--border-color); border-radius: 10px; font: inherit; font-size: 14px; cursor: pointer; }
.primary-btn { color: var(--accent-foreground); background: var(--accent-color); border-color: transparent; }
.primary-btn:hover { background: var(--accent-hover); }
.secondary-btn { background: var(--bg-card); color: var(--text-primary); }
button:disabled { opacity: 0.55; cursor: default; }
.action-error { width: 100%; color: var(--danger-text); font-size: 13px; }
.share-render-stage { position: fixed; top: 0; left: -10000px; pointer-events: none; }

/* The exported image owns every visual token, independently of app skins and dark mode. */
.share-render-card {
  --image-ink: #222b38; --image-muted: #6b7685; --image-accent: #526b81; --image-rule: #dce2e9; --image-soft: #f0f3f7;
  --image-font: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
  --text-primary: var(--image-ink); --text-secondary: var(--image-muted); --accent-color: var(--image-accent); --accent-text: var(--image-accent);
  --accent-foreground: #fff; --border-color: var(--image-rule); --bg-main: var(--image-soft); --bg-card: #fff;
  --font-size-supporting: 16px; --font-mono: Consolas, "Courier New", monospace; --radius-md: 8px;
  width: 560px; padding: 24px; color: var(--image-ink); background: #edf1f5;
  font-family: var(--image-font); font-size: 20px; line-height: 1.85; font-weight: 400;
}
.image-sheet { display: flex; flex-direction: column; min-height: 360px; padding: 32px 36px; background: #fff; border: 1px solid #e4e9ef; }
.image-masthead { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 30px; padding-bottom: 18px; border-bottom: 1px solid var(--image-rule); }
.image-brand { display: flex; align-items: center; gap: 8px; font-family: "Segoe UI", Arial, sans-serif; font-size: 13px; line-height: 1.5; font-weight: 600; letter-spacing: 0.7px; color: var(--image-ink); }
.brand-mark { width: 9px; height: 9px; border: 2px solid var(--image-accent); border-radius: 2px; }
.image-header-date, .image-footer-date { font-family: "Segoe UI", Arial, sans-serif; font-size: 11px; line-height: 1.5; font-weight: 400; letter-spacing: 0.3px; white-space: nowrap; color: var(--image-muted); }
.image-content, .image-main { min-width: 0; }
.image-body { font-family: var(--image-font); font-size: 20px; line-height: 1.85; color: var(--image-ink); overflow-wrap: anywhere; }
.image-body :deep(p) { margin-bottom: 18px; }
.image-body :deep(p:last-child) { margin-bottom: 0; }
.image-body :deep(a) { color: var(--image-accent); text-decoration-thickness: 1px; text-underline-offset: 3px; }
.image-body :deep(h1), .image-body :deep(h2), .image-body :deep(h3), .image-body :deep(h4), .image-body :deep(h5), .image-body :deep(h6) { margin-top: 24px; margin-bottom: 18px; line-height: 1.4; font-weight: 600; color: var(--image-ink); }
.image-body :deep(h1) { font-size: 30px; letter-spacing: -0.6px; }
.image-body :deep(h2) { font-size: 26px; }
.image-body :deep(h3) { font-size: 23px; }
.image-body :deep(h4), .image-body :deep(h5), .image-body :deep(h6) { font-size: 20px; }
.image-body :deep(> :first-child) { margin-top: 0; }
.image-body :deep(blockquote) { margin: 22px 0; padding: 10px 18px; border-left: 1px solid var(--image-accent); background: var(--image-soft); color: var(--image-ink); }
.image-body :deep(pre) { padding: 16px; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--image-soft); color: var(--image-ink); border-radius: 8px; font-size: 15px; line-height: 1.7; }
.image-body :deep(code) { font-family: var(--font-mono); background: var(--image-soft); color: var(--image-ink); }
.image-body :deep(pre code) { padding: 0; background: transparent; }
.image-body :deep(table) { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 15px; }
.image-body :deep(th), .image-body :deep(td) { padding: 8px 10px; border-color: var(--image-rule); }
.image-body :deep(th) { background: var(--image-soft); }
.image-body :deep(img) { display: block; max-width: 100%; height: auto; }
.image-body :deep(hr) { margin: 24px 0; border: 0; border-top: 1px solid var(--image-rule); }
.image-attachments { display: grid; gap: 16px; margin-top: 22px; }
.image-attachments img { display: block; width: 100%; height: auto; border-radius: 8px; }
.image-file { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--image-rule); border-radius: 8px; font-size: 14px; overflow-wrap: anywhere; }
.image-file svg { flex-shrink: 0; }
.image-footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-top: auto; padding-top: 28px; }
.image-tags { display: flex; flex-wrap: wrap; gap: 6px 12px; font-family: "Segoe UI", "Microsoft YaHei", sans-serif; color: var(--image-muted); font-size: 12px; line-height: 1.6; }
.image-signature { color: var(--image-muted); font-family: "Segoe UI", "Microsoft YaHei", sans-serif; font-size: 11px; letter-spacing: 0.5px; }
.image-footer-date { display: none; }

.layout-paper { --image-font: "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", SimSun, serif; --image-ink: #323b45; --image-accent: #626f7c; --image-muted: #78818a; background: #f8fafb; padding: 34px; }
.layout-paper .image-sheet { padding: 28px 24px 24px; background: transparent; border: 0; border-top: 2px solid #48515c; border-bottom: 1px solid #48515c; }
.layout-paper .image-masthead { justify-content: center; margin-bottom: 34px; padding-bottom: 20px; }
.layout-paper .image-brand { letter-spacing: 4px; font-size: 12px; }
.layout-paper .brand-mark, .layout-paper .image-header-date { display: none; }
.layout-paper .image-body { font-size: 22px; line-height: 1.9; letter-spacing: 0.4px; }
.layout-paper .image-body :deep(h1) { font-size: 32px; font-weight: 600; }
.layout-paper .image-footer { margin-top: 30px; padding-top: 18px; border-top: 1px solid var(--image-rule); }
.layout-paper .image-footer-date { display: block; }

.layout-night { --image-ink: #eef3f9; --image-muted: #a5b4c7; --image-accent: #a8cbd4; --image-rule: #35465a; --image-soft: #253447; --accent-foreground: #142333; background: linear-gradient(135deg, #121d2c 15%, #1d354d 100%); padding: 40px; }
.layout-night .image-sheet { min-height: 340px; padding: 0; border: 0; background: transparent; }
.layout-night .image-masthead { border: 0; margin-bottom: 34px; padding: 0; }
.layout-night .image-header-date { display: none; }
.layout-night .brand-mark { background: #a8cbd4; border: 0; border-radius: 50%; width: 6px; height: 6px; }
.layout-night .image-brand { color: #bfcedd; font-size: 12px; letter-spacing: 1.8px; }
.layout-night .image-content { padding-left: 24px; border-left: 1px solid #85adbd; }
.layout-night .image-body { font-size: 22px; line-height: 1.8; }
.layout-night .image-body :deep(h1) { font-size: 32px; }
.layout-night .image-footer { padding-top: 32px; align-items: center; }
.layout-night .image-tags span { padding: 3px 9px; border: 1px solid #405b71; border-radius: 999px; color: #bacbdb; }
.layout-night .image-footer-date { display: block; }

.layout-column { --image-accent: #b8523c; --image-ink: #26313f; background: #e8edf3; padding: 22px; }
.layout-column .image-sheet { padding: 32px 30px; border: 0; }
.layout-column .image-masthead { margin-bottom: 24px; justify-content: flex-end; padding-bottom: 0; border: 0; }
.layout-column .image-brand { color: #808997; font-size: 11px; }
.layout-column .brand-mark, .layout-column .image-header-date { display: none; }
.layout-column .image-content { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 24px; }
.image-date-column { align-self: start; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding-top: 10px; border-top: 3px solid var(--image-accent); color: #7a8591; font-family: "Segoe UI", Arial, sans-serif; font-size: 11px; line-height: 1.5; font-weight: 400; }
.image-date-column strong { color: var(--image-accent); font-size: 58px; letter-spacing: -3px; line-height: 1.05; font-weight: 300; }
.layout-column .image-body { font-size: 20px; line-height: 1.85; }
.layout-column .image-body :deep(h1) { font-size: 29px; }
.layout-column .image-footer { margin-left: 96px; padding-top: 26px; }
.layout-column .image-tags { color: var(--image-accent); }

@media (max-width: 767px) {
  .share-header { padding: 10px 12px; }
  .layout-toolbar { padding: 0 12px 12px; }
  .layout-option { padding: 6px; }
  .layout-swatch { height: 44px; padding: 6px; }
  .swatch-minimal { padding: 3px; border-width: 4px; }
  .swatch-column { padding-left: 22px; }
  .share-preview { padding: 12px; }
  .share-footer { padding: 12px; }
  .share-footer button { flex: 1; }
}
</style>
