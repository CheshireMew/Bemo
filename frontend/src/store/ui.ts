import { ref } from 'vue';

export type ThemeSkin = 'default' | 'nord' | 'sepia';

// 全局状态：黑夜模式与风格皮肤解耦
export const isDarkMode = ref(false);
export const currentSkin = ref<ThemeSkin>('default');

// 初始化和切换主题
export function initTheme() {
  const savedSkin = localStorage.getItem('theme-skin') as ThemeSkin | null;
  if (savedSkin && ['default', 'nord', 'sepia'].includes(savedSkin)) {
    currentSkin.value = savedSkin;
  }
  
  const savedMode = localStorage.getItem('theme-mode');
  if (savedMode === 'dark' || (!savedMode && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    isDarkMode.value = true;
  }
  
  applyTheme();
}

export function toggleTheme() {
  isDarkMode.value = !isDarkMode.value;
  localStorage.setItem('theme-mode', isDarkMode.value ? 'dark' : 'light');
  applyTheme();
}

export function setSkin(skin: ThemeSkin) {
  currentSkin.value = skin;
  localStorage.setItem('theme-skin', skin);
  applyTheme();
}

function applyTheme() {
  const root = document.documentElement;
  // 暗黑类
  if (isDarkMode.value) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  
  // 皮肤类
  root.classList.remove('theme-nord', 'theme-sepia');
  if (currentSkin.value === 'nord') {
    root.classList.add('theme-nord');
  } else if (currentSkin.value === 'sepia') {
    root.classList.add('theme-sepia');
  }
}


// 视图模式
export type ViewMode = 'all' | 'trash' | 'random';
export const currentView = ref<ViewMode>('all');
export const randomWalkNonce = ref(0);
export const isAiChatOpen = ref(false);
export const aiChatNoteId = ref<string | null>(null);
export const aiChatNoteLabel = ref('');
export const isMobileSettingsOpen = ref(false);
export const isMobileComposeOpen = ref(false);
export const mobileEditingNoteId = ref<string | null>(null);
export type ImagePreviewItem = {
  url: string;
  label: string;
};
export const isImagePreviewOpen = ref(false);
export const imagePreviewItems = ref<ImagePreviewItem[]>([]);
export const imagePreviewIndex = ref(0);

export function setView(mode: ViewMode) {
  currentView.value = mode;
}

export function openRandomWalk() {
  currentView.value = 'random';
  randomWalkNonce.value += 1;
}

export function openAiChat(options?: { noteId?: string | null; noteLabel?: string }) {
  aiChatNoteId.value = options?.noteId || null;
  aiChatNoteLabel.value = options?.noteLabel?.trim() || '';
  isAiChatOpen.value = true;
}

export function closeAiChat() {
  isAiChatOpen.value = false;
  aiChatNoteId.value = null;
  aiChatNoteLabel.value = '';
}

export function openMobileSettings() {
  isMobileSettingsOpen.value = true;
}

export function closeMobileSettings() {
  isMobileSettingsOpen.value = false;
}

export function openMobileCompose() {
  isMobileComposeOpen.value = true;
}

export function closeMobileCompose() {
  isMobileComposeOpen.value = false;
}

export function openMobileNoteEditor(noteId: string) {
  mobileEditingNoteId.value = noteId || null;
}

export function closeMobileNoteEditor() {
  mobileEditingNoteId.value = null;
}

export function openImagePreview(items: ImagePreviewItem[], activeUrl?: string) {
  if (!items.length) return;
  imagePreviewItems.value = items;
  imagePreviewIndex.value = Math.max(0, items.findIndex((item) => item.url === activeUrl));
  isImagePreviewOpen.value = true;
}

export function closeImagePreview() {
  isImagePreviewOpen.value = false;
  imagePreviewItems.value = [];
  imagePreviewIndex.value = 0;
}

export function showNextPreviewImage() {
  if (imagePreviewItems.value.length <= 1) return;
  imagePreviewIndex.value = (imagePreviewIndex.value + 1) % imagePreviewItems.value.length;
}

export function showPreviousPreviewImage() {
  if (imagePreviewItems.value.length <= 1) return;
  imagePreviewIndex.value = (imagePreviewIndex.value - 1 + imagePreviewItems.value.length) % imagePreviewItems.value.length;
}

// 侧边栏状态 (例如：移动端侧边栏是否展开等，如果后续需要)
export const isSidebarOpen = ref(false);
export function openSidebar() {
  isSidebarOpen.value = true;
}

export function closeSidebar() {
  isSidebarOpen.value = false;
}

export function toggleSidebar() {
  isSidebarOpen.value = !isSidebarOpen.value;
}
