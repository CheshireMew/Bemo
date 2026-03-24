import type { AiConversationTimeRange } from './aiConversationTypes.js';

export type LocalMessageRecord = {
  role: 'user' | 'assistant';
  content: string;
  created_at: number;
};

export type LocalConversationRecord = {
  id: string;
  title: string;
  context_mode: AiConversationTimeRange | null;
  created_at: number;
  updated_at: number;
  message_count: number;
  messages: LocalMessageRecord[];
};

const STORAGE_KEY = 'bemo.ai.conversations';

function readAll(): LocalConversationRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as LocalConversationRecord[] : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: LocalConversationRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function createId() {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listConversations() {
  return readAll()
    .map(({ messages, ...summary }) => ({ ...summary }))
    .sort((a, b) => b.updated_at - a.updated_at);
}

export function getConversation(conversationId: string) {
  const found = readAll().find((item) => item.id === conversationId);
  if (!found) {
    throw new Error('对话不存在');
  }
  return found;
}

export function createConversation(title: string, contextMode: AiConversationTimeRange | null) {
  const now = Math.floor(Date.now() / 1000);
  const record: LocalConversationRecord = {
    id: createId(),
    title,
    context_mode: contextMode,
    created_at: now,
    updated_at: now,
    message_count: 0,
    messages: [],
  };
  const all = readAll();
  writeAll([record, ...all]);
  return record;
}

export function updateConversation(conversationId: string, updates: {
  title?: string | null;
  context_mode?: AiConversationTimeRange | null;
}) {
  const all = readAll();
  const next = all.map((item) => {
    if (item.id !== conversationId) return item;
    return {
      ...item,
      title: updates.title ?? item.title,
      context_mode: updates.context_mode !== undefined ? updates.context_mode : item.context_mode,
      updated_at: Math.floor(Date.now() / 1000),
    };
  });
  writeAll(next);
  return getConversation(conversationId);
}

export function deleteConversation(conversationId: string) {
  const all = readAll().filter((item) => item.id !== conversationId);
  writeAll(all);
}

export function appendConversationMessages(
  conversationId: string,
  entries: Array<{ role: 'user' | 'assistant'; content: string }>,
) {
  const now = Math.floor(Date.now() / 1000);
  const all = readAll();
  const next = all.map((item) => {
    if (item.id !== conversationId) return item;
    const messages = [
      ...item.messages,
      ...entries.map((entry) => ({ ...entry, created_at: now })),
    ];
    return {
      ...item,
      messages,
      message_count: messages.length,
      updated_at: now,
    };
  });
  writeAll(next);
  return getConversation(conversationId);
}
