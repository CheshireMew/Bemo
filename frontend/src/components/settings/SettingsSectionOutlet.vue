<template>
  <div class="settings-content">
    <SettingsSyncSection v-if="activeTab === 'sync'" />
    <SettingsAppearanceSection v-else-if="activeTab === 'appearance'" />
    <SettingsAttachmentsSection v-else-if="activeTab === 'attachments'" />
    <SettingsImportExportSection v-else-if="activeTab === 'import-export'" @imported="emit('notesImported')" />
    <SettingsEditorSection v-else-if="activeTab === 'editor'" />
    <SettingsShortcutsSection v-else-if="activeTab === 'shortcuts'" />
    <SettingsAiSection v-else-if="activeTab === 'ai'" />
    <SettingsTrashSection v-else-if="activeTab === 'trash'" />
    <SettingsConflictsSection v-else />
  </div>
</template>

<script setup lang="ts">
import SettingsAppearanceSection from '../SettingsAppearanceSection.vue';
import SettingsAiSection from '../SettingsAiSection.vue';
import SettingsAttachmentsSection from '../SettingsAttachmentsSection.vue';
import SettingsConflictsSection from '../SettingsConflictsSection.vue';
import SettingsEditorSection from '../SettingsEditorSection.vue';
import SettingsImportExportSection from '../SettingsImportExportSection.vue';
import SettingsShortcutsSection from '../SettingsShortcutsSection.vue';
import SettingsSyncSection from '../SettingsSyncSection.vue';
import SettingsTrashSection from '../SettingsTrashSection.vue';
import type { SettingsTabId } from '../../composables/useSettingsTabs';

defineProps<{
  activeTab: SettingsTabId;
}>();

const emit = defineEmits<{
  notesImported: [];
}>();
</script>

<style scoped>
.settings-content {
  min-width: 0;
  padding: 24px 24px 32px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
  flex: 1;
  border-left: 1px solid var(--border-color, #eaeaea);
  scrollbar-width: none;
}

.settings-content::-webkit-scrollbar {
  display: none;
}

@media (max-width: 767px) {
  .settings-content {
    border-left: none;
    padding: 18px 16px calc(24px + var(--safe-bottom));
  }
}
</style>
