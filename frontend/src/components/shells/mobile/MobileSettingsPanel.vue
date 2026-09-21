<template>
  <teleport to="body">
    <div v-if="open" class="settings-overlay" @click.self="emit('close')">
      <section
        ref="settingsPanelRef"
        v-modal-focus="handleBackOrClose"
        class="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
      >
        <header class="settings-header">
          <button
            v-if="!showIndex"
            class="header-icon-btn back-btn"
            type="button"
            aria-label="返回设置首页"
            @click="showSettingsIndex"
          >
            <ChevronLeft :size="24" />
          </button>
          <h2>设置</h2>
          <button class="header-icon-btn close-btn" type="button" aria-label="关闭设置" @click="emit('close')">
            <X :size="21" />
          </button>
        </header>

        <div v-if="showIndex" class="settings-index">
          <section v-for="group in tabGroups" :key="group.label" class="settings-index-group">
            <h3>{{ group.label }}</h3>
            <div class="settings-index-list">
              <button
                v-for="tab in group.tabs"
                :key="tab.id"
                type="button"
                class="settings-index-item"
                @click="openSection(tab.id)"
              >
                <span class="settings-index-icon" aria-hidden="true">
                  <component :is="tab.icon" :size="20" />
                </span>
                <span class="settings-index-copy">
                  <strong>{{ tab.label }}</strong>
                  <small>{{ tabDescriptions[tab.id] }}</small>
                </span>
                <ChevronRight class="settings-index-chevron" :size="20" aria-hidden="true" />
              </button>
            </div>
          </section>
        </div>

        <div v-else class="settings-detail" :aria-label="activeTabMeta?.label">
          <SettingsSectionOutlet
            :key="activeTab"
            :active-tab="activeTab"
            @notesImported="emit('notesImported')"
          />
        </div>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, X } from 'lucide-vue-next';
import { vModalFocus } from '../../../directives/modalFocus';
import SettingsSectionOutlet from '../../settings/SettingsSectionOutlet.vue';
import { useSettingsTabs, type SettingsTabId } from '../../../composables/useSettingsTabs';
import { useMobileBackHandler } from '../../../composables/useMobileBackHandler';
import { useScrollLock } from '../../../composables/useScrollLock';
import { settingsRequestNonce } from '../../../store/ui';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  notesImported: [];
}>();

const { activeTab, tabs } = useSettingsTabs();
const settingsPanelRef = ref<HTMLElement | null>(null);
const showIndex = ref(true);
const handledRequestNonce = ref(settingsRequestNonce.value);

const tabDescriptions: Record<SettingsTabId, string> = {
  sync: '选择本地、服务器或 WebDAV',
  conflicts: '查看并处理同步冲突',
  appearance: '深色模式与主题配色',
  attachments: '查看占用并清理无引用文件',
  'import-export': '备份、恢复与数据迁移',
  editor: '编辑模式、草稿和图片设置',
  shortcuts: '查看键盘快捷操作',
  trash: '恢复或永久删除笔记',
};

const tabGroups = computed(() => ([
  {
    label: '同步与数据',
    tabs: tabs.filter(tab => ['sync', 'conflicts', 'attachments', 'import-export'].includes(tab.id)),
  },
  {
    label: '个性化',
    tabs: tabs.filter(tab => ['appearance', 'editor', 'shortcuts'].includes(tab.id)),
  },
  {
    label: '存储管理',
    tabs: tabs.filter(tab => tab.id === 'trash'),
  },
]).filter(group => group.tabs.length));

const activeTabMeta = computed(() => tabs.find(tab => tab.id === activeTab.value));

const scrollDetailToTop = () => {
  void nextTick(() => {
    settingsPanelRef.value?.querySelector<HTMLElement>('.settings-content')?.scrollTo({ top: 0 });
  });
};

const openSection = (tab: SettingsTabId) => {
  activeTab.value = tab;
  showIndex.value = false;
  scrollDetailToTop();
};

const showSettingsIndex = () => {
  showIndex.value = true;
};

const handleBackOrClose = () => {
  if (!showIndex.value) {
    showSettingsIndex();
    return;
  }
  emit('close');
};

watch(settingsRequestNonce, nonce => {
  if (!props.open) return;
  handledRequestNonce.value = nonce;
  showIndex.value = false;
  scrollDetailToTop();
});

watch(() => props.open, open => {
  if (!open) return;
  const requestedDirectly = settingsRequestNonce.value !== handledRequestNonce.value;
  handledRequestNonce.value = settingsRequestNonce.value;
  showIndex.value = !requestedDirectly;
  if (requestedDirectly) scrollDetailToTop();
});

useScrollLock(computed(() => props.open));
useMobileBackHandler({
  id: 'mobile-settings-panel',
  priority: 660,
  enabled: computed(() => props.open),
  dismiss: handleBackOrClose,
});
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-main);
  z-index: 420;
  display: flex;
  justify-content: center;
  align-items: stretch;
  padding: 0;
}

.settings-panel {
  width: 100vw;
  height: 100dvh;
  background: var(--bg-main);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  min-height: calc(56px + var(--safe-top));
  padding: var(--safe-top) 6px 0 16px;
  display: flex;
  gap: 4px;
  align-items: center;
  border-bottom: 1px solid var(--border-color, #e4e4e7);
  background: color-mix(in srgb, var(--bg-card) 94%, var(--bg-main));
  flex-shrink: 0;
}

.settings-header h2 {
  margin: 0;
  flex: 1;
  color: var(--text-primary, #18181b);
  font-size: 1.18rem;
  font-weight: 650;
  line-height: 1;
}

.header-icon-btn {
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary, #71717a);
  cursor: pointer;
  display: grid;
  place-items: center;
  flex: 0 0 44px;
}

.header-icon-btn:active {
  background: color-mix(in srgb, var(--border-color) 72%, transparent);
  color: var(--text-primary);
}

.settings-index {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 20px 16px calc(28px + var(--safe-bottom));
  scrollbar-width: none;
}

.settings-index::-webkit-scrollbar {
  display: none;
}

.settings-index-group + .settings-index-group {
  margin-top: 24px;
}

.settings-index-group h3 {
  margin: 0 4px 8px;
  color: var(--text-secondary);
  font-size: var(--font-size-small);
  font-weight: 600;
  line-height: 1.4;
}

.settings-index-list {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--border-color) 82%, transparent);
  border-radius: 16px;
  background: var(--bg-card);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.035);
}

.settings-index-item {
  position: relative;
  width: 100%;
  min-height: 68px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 24px;
  gap: 10px;
  align-items: center;
  text-align: left;
  cursor: pointer;
}

.settings-index-item + .settings-index-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 62px;
  right: 0;
  height: 1px;
  background: var(--border-color);
}

.settings-index-item:active {
  background: color-mix(in srgb, var(--accent-color) 7%, var(--bg-main));
}

.settings-index-icon {
  width: 36px;
  height: 36px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--accent-color) 12%, var(--bg-card));
  color: var(--accent-text);
}

.settings-index-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-index-copy strong {
  font-size: var(--font-size-body);
  font-weight: 600;
  line-height: 1.35;
}

.settings-index-copy small {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: var(--font-size-small);
  font-weight: 400;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-index-chevron {
  color: color-mix(in srgb, var(--text-secondary) 68%, transparent);
}

.settings-detail {
  min-height: 0;
  flex: 1;
  display: flex;
  overflow: hidden;
}

.settings-detail :deep(.settings-content) {
  width: 100%;
  padding: 16px 16px calc(28px + var(--safe-bottom));
  gap: 16px;
  overscroll-behavior: contain;
}
</style>
