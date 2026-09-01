import { ref, watch, type Ref } from 'vue';
import type { ConversationSummary } from './useAiConversations.js';

export function useConversationRename(options: {
  activeConversationId: Ref<string | null>;
  renameConversation: (conversation: ConversationSummary, nextTitle: string) => Promise<void>;
}) {
  const editingConversationId = ref<string | null>(null);
  const editingTitleDraft = ref('');
  const editingTitleInput = ref<HTMLInputElement | null>(null);

  const startConversationRename = (conversation: ConversationSummary) => {
    editingConversationId.value = conversation.id;
    editingTitleDraft.value = conversation.title;
    requestAnimationFrame(() => {
      editingTitleInput.value?.focus();
      editingTitleInput.value?.select();
    });
  };

  const cancelConversationRename = () => {
    editingConversationId.value = null;
    editingTitleDraft.value = '';
  };

  const submitConversationRename = async (conversation: ConversationSummary) => {
    const nextTitle = editingTitleDraft.value.trim();
    if (!nextTitle || nextTitle === conversation.title) {
      cancelConversationRename();
      return;
    }
    await options.renameConversation(conversation, nextTitle);
    cancelConversationRename();
  };

  watch(options.activeConversationId, () => {
    cancelConversationRename();
  });

  return {
    cancelConversationRename,
    editingConversationId,
    editingTitleDraft,
    editingTitleInput,
    startConversationRename,
    submitConversationRename,
  };
}
