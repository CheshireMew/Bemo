import { ref } from 'vue';

// 全局主题 (深色/浅色)
export const isDarkMode = ref(false);

// 初始化和切换主题
export function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    isDarkMode.value = true;
    document.documentElement.classList.add('dark');
  }
}

export function toggleTheme() {
  isDarkMode.value = !isDarkMode.value;
  if (isDarkMode.value) {
    document.documentElement.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  } else {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }
}

// 视图模式
export type ViewMode = 'all' | 'trash' | 'random';
export const currentView = ref<ViewMode>('all');

export function setView(mode: ViewMode) {
  currentView.value = mode;
}

// 侧边栏状态 (例如：移动端侧边栏是否展开等，如果后续需要)
export const isSidebarOpen = ref(false);
export function toggleSidebar() {
  isSidebarOpen.value = !isSidebarOpen.value;
}
