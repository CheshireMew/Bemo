import { ref, type Ref } from 'vue';
import axios from 'axios';
import { API_BASE } from '../config';
import type {
  ConversationDetail,
  ConversationSummary,
  LocalMessage,
  TimeRange,
} from './useAiConversations';

type ContextNote = {
  title: string;
  content: string;
  created_at: number;
};

type UseAiChatOptions = {
  draft: Ref<string>;
  messages: Ref<LocalMessage[]>;
  errorMessage: Ref<string>;
  selectedRange: Ref<TimeRange | null>;
  activeConversationId: Ref<string | null>;
  activeConversation: Ref<ConversationSummary | null>;
  contextNotes: Ref<ContextNote[]>;
  ensureConversation: () => Promise<void>;
  syncConversationSummary: (detail: ConversationDetail) => void;
};

export function useAiChat(options: UseAiChatOptions) {
  const isLoading = ref(false);

  const sendMessage = async () => {
    const content = options.draft.value.trim();
    if (!content) return;
    if (!options.activeConversationId.value) {
      await options.ensureConversation();
    }
    if (!options.activeConversationId.value) return;

    options.messages.value.push({ role: 'user', content });
    options.draft.value = '';
    options.errorMessage.value = '';
    const currentConversationId = options.activeConversationId.value;

    try {
      isLoading.value = true;
      const currentConversation = options.activeConversation.value;
      const optimisticMessageCount = options.messages.value.length;
      const res = await axios.post(`${API_BASE}/ai/chat`, {
        message: content,
        conversation_id: currentConversationId,
        context_mode: options.selectedRange.value,
        notes: options.contextNotes.value.map((note) => ({
          title: note.title,
          content: note.content,
          created_at: Math.floor(note.created_at),
        })),
      });

      // If the user switched conversations while the request was in flight,
      // let a later refetch populate that thread instead of appending into the wrong UI.
      if (options.activeConversationId.value === currentConversationId) {
        options.messages.value.push({
          role: 'assistant',
          content: res.data.reply || '',
        });
      }

      options.syncConversationSummary({
        id: res.data.conversation_id,
        title: res.data.title,
        context_mode: res.data.context_mode,
        created_at: currentConversation?.created_at || Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        message_count: options.activeConversationId.value === currentConversationId
          ? options.messages.value.length
          : optimisticMessageCount + 1,
        messages: [],
      });
    } catch (error: any) {
      options.errorMessage.value = error.response?.data?.detail || error.message || 'AI 对话失败';
      if (options.activeConversationId.value === currentConversationId) {
        options.messages.value = options.messages.value.filter((message, index) => {
          return !(index === options.messages.value.length - 1 && message.role === 'user' && message.content === content);
        });
      }
      options.draft.value = content;
    } finally {
      isLoading.value = false;
    }
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return {
    handleKeydown,
    isLoading,
    sendMessage,
  };
}
