import { computed, ref, type Ref } from 'vue';
import type { AiPromptPreset } from '../store/settingsTypes';
import { settings } from '../store/settings';
import { removeAiPromptPreset, upsertAiPromptPreset } from '../services/aiPromptPresets';
import { requestConfirmation } from '../store/dialogs.js';

type UseAiPromptPresetsOptions = {
  draft: Ref<string>;
};

export function useAiPromptPresets(options: UseAiPromptPresetsOptions) {
  const isPresetPanelOpen = ref(false);
  const presetDraft = ref('');
  const editingPresetId = ref<string | null>(null);
  const promptPresets = computed(() => settings.aiPrompts.presets);

  const togglePresetPanel = () => {
    isPresetPanelOpen.value = !isPresetPanelOpen.value;
  };

  const resetPresetEditor = () => {
    presetDraft.value = '';
    editingPresetId.value = null;
  };

  const savePreset = () => {
    if (!presetDraft.value.trim()) return;
    upsertAiPromptPreset({
      id: editingPresetId.value || undefined,
      content: presetDraft.value,
    });
    resetPresetEditor();
  };

  const usePromptPreset = (preset: string) => {
    options.draft.value = preset;
    isPresetPanelOpen.value = false;
  };

  const startEditPreset = (preset: AiPromptPreset) => {
    editingPresetId.value = preset.id;
    presetDraft.value = preset.content;
  };

  const removePrompt = async (presetId: string) => {
    const preset = promptPresets.value.find((item) => item.id === presetId);
    const confirmed = await requestConfirmation({
      title: '删除常用提示词？',
      message: preset?.content || '这条提示词将被永久删除。',
      confirmLabel: '删除提示词',
      danger: true,
    });
    if (!confirmed) return;
    if (editingPresetId.value === presetId) {
      resetPresetEditor();
    }
    removeAiPromptPreset(presetId);
  };

  const handleClosed = () => {
    isPresetPanelOpen.value = false;
    resetPresetEditor();
  };

  return {
    editingPresetId,
    handleClosed,
    isPresetPanelOpen,
    presetDraft,
    promptPresets,
    removePrompt,
    resetPresetEditor,
    savePreset,
    startEditPreset,
    togglePresetPanel,
    usePromptPreset,
  };
}
