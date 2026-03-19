import { computed, nextTick, ref, watch, type Ref } from 'vue';
import { isAiChatOpen } from '../store/ui';
import {
  appendConversationMessages,
  createConversation as createLocalConversation,
  deleteConversation as deleteLocalConversation,
  getConversation,
  listConversations as listLocalConversations,
  updateConversation as updateLocalConversation,
} from '../domain/ai/localAiConversations';

export type TimeRange = 'filtered' | 'all-notes' | 'day' | 'week' | 'month' | 'year';

export type LocalMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  context_mode: TimeRange | null;
  created_at: number;
  updated_at: number;
  message_count: number;
};

export type ConversationDetail = ConversationSummary & {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    created_at: number;
  }>;
};

type UseAiConversationsOptions = {
  messages: Ref<LocalMessage[]>;
  selectedRange: Ref<TimeRange | null>;
  errorMessage: Ref<string>;
  onClosed?: () => void;
};

export function useAiConversations(options: UseAiConversationsOptions) {
  const isLoadingList = ref(false);
  const conversations = ref<ConversationSummary[]>([]);
  const activeConversationId = ref<string | null>(null);
  const conversationListRef = ref<HTMLElement | null>(null);
  const conversationItemRefs = new Map<string, HTMLElement>();

  const activeConversation = computed(() => {
    if (!activeConversationId.value) return null;
    return conversations.value.find((conversation) => conversation.id === activeConversationId.value) || null;
  });

  const setConversationItemRef = (conversationId: string, element: unknown) => {
    if (element instanceof HTMLElement) {
      conversationItemRefs.set(conversationId, element);
      return;
    }
    conversationItemRefs.delete(conversationId);
  };

  const scrollActiveConversationIntoView = async () => {
    await nextTick();
    if (!activeConversationId.value) return;
    const activeElement = conversationItemRefs.get(activeConversationId.value);
    if (!activeElement || !conversationListRef.value) return;
    activeElement.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth',
    });
  };

  const syncConversationSummary = (detail: ConversationDetail) => {
    const summary: ConversationSummary = {
      id: detail.id,
      title: detail.title,
      context_mode: detail.context_mode,
      created_at: detail.created_at,
      updated_at: detail.updated_at,
      message_count: detail.message_count,
    };
    const next = conversations.value.filter((item) => item.id !== summary.id);
    conversations.value = [summary, ...next];
  };

  const loadConversations = async () => {
    try {
      isLoadingList.value = true;
      conversations.value = listLocalConversations();
    } catch (error) {
      console.error('Failed to load AI conversations.', error);
    } finally {
      isLoadingList.value = false;
    }
  };

  const selectConversation = async (conversationId: string) => {
    try {
      const detail = getConversation(conversationId) as ConversationDetail;
      activeConversationId.value = detail.id;
      options.selectedRange.value = detail.context_mode || null;
      options.messages.value = detail.messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));
      syncConversationSummary(detail);
      options.errorMessage.value = '';
      await scrollActiveConversationIntoView();
    } catch (error: any) {
      options.errorMessage.value = error.response?.data?.detail || error.message || '加载对话失败';
    }
  };

  const createConversation = async (input?: { title?: string; contextMode?: TimeRange | null }) => {
    try {
      const detail = createLocalConversation(
        input?.title?.trim() || '新对话',
        input?.contextMode ?? null,
      ) as ConversationDetail;
      activeConversationId.value = detail.id;
      options.selectedRange.value = detail.context_mode || null;
      options.messages.value = [];
      syncConversationSummary(detail);
      options.errorMessage.value = '';
      await scrollActiveConversationIntoView();
    } catch (error: any) {
      options.errorMessage.value = error.response?.data?.detail || error.message || '创建对话失败';
    }
  };

  const renameConversation = async (conversation: ConversationSummary, nextTitle: string) => {
    const normalizedTitle = nextTitle.trim();
    if (!normalizedTitle || normalizedTitle === conversation.title) return;
    try {
      const detail = updateLocalConversation(conversation.id, {
        title: normalizedTitle,
      }) as ConversationDetail;
      syncConversationSummary(detail);
      if (activeConversationId.value === conversation.id) {
        await selectConversation(conversation.id);
      }
    } catch (error: any) {
      options.errorMessage.value = error.response?.data?.detail || error.message || '重命名失败';
    }
  };

  const deleteConversation = async (conversation: ConversationSummary) => {
    try {
      deleteLocalConversation(conversation.id);
      const nextConversations = conversations.value.filter((item) => item.id !== conversation.id);
      conversations.value = nextConversations;

      if (activeConversationId.value !== conversation.id) {
        return;
      }

      if (nextConversations.length > 0) {
        await selectConversation(nextConversations[0].id);
        return;
      }

      activeConversationId.value = null;
      options.selectedRange.value = null;
      options.messages.value = [];
      options.errorMessage.value = '';
    } catch (error: any) {
      options.errorMessage.value = error.response?.data?.detail || error.message || '删除对话失败';
    }
  };

  const updateConversationContext = async (contextMode: TimeRange | null) => {
    if (!activeConversationId.value) return;
    try {
      const detail = updateLocalConversation(activeConversationId.value, {
        context_mode: contextMode,
      }) as ConversationDetail;
      syncConversationSummary(detail);
    } catch (error) {
      console.error('Failed to update conversation context.', error);
    }
  };

  watch(activeConversationId, () => {
    void scrollActiveConversationIntoView();
  });

  watch(isAiChatOpen, async (open) => {
    if (!open) {
      options.onClosed?.();
      return;
    }
    await loadConversations();
    if (conversations.value.length > 0) {
      await selectConversation(conversations.value[0].id);
    } else {
      activeConversationId.value = null;
      options.messages.value = [];
      options.selectedRange.value = null;
    }
  });

  return {
    activeConversation,
    activeConversationId,
    appendConversationMessages,
    conversationListRef,
    conversations,
    createConversation,
    deleteConversation,
    isLoadingList,
    loadConversations,
    renameConversation,
    selectConversation,
    setConversationItemRef,
    syncConversationSummary,
    updateConversationContext,
  };
}
