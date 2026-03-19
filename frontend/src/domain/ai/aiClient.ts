import { settings } from '../settings/settingsState';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ContextNote = {
  title: string;
  content: string;
  created_at: number;
};

function buildNoteBlocks(notes: ContextNote[], limit = 18, charBudget = 14000) {
  let used = 0;
  const result: string[] = [];
  for (const note of notes.slice(0, limit)) {
    const block = [
      `标题: ${note.title || '未命名笔记'}`,
      `时间: ${new Date(note.created_at * 1000).toISOString()}`,
      '内容:',
      note.content,
    ].join('\n');
    if (used + block.length > charBudget) break;
    used += block.length;
    result.push(block);
  }
  return result;
}

function buildMessages(input: {
  systemPrompt?: string;
  userMessage: string;
  noteBlocks: string[];
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (input.systemPrompt?.trim()) {
    messages.push({ role: 'system', content: input.systemPrompt.trim() });
  }
  if (input.noteBlocks.length > 0) {
    messages.push({
      role: 'system',
      content: `以下是与当前问题相关的笔记上下文，请结合它们回答：\n\n${input.noteBlocks.map((block, index) => `[#${index + 1}]\n${block}`).join('\n\n')}`,
    });
  }
  messages.push(...input.history.map((item) => ({ role: item.role, content: item.content })));
  messages.push({ role: 'user', content: input.userMessage });
  return messages;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, '');
}

export async function requestAiChat(input: {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  notes: ContextNote[];
}) {
  const baseUrl = normalizeBaseUrl(settings.ai.baseUrl);
  const apiKey = settings.ai.apiKey.trim();
  const model = settings.ai.model.trim();

  if (!settings.ai.enabled) {
    throw new Error('AI 功能未启用');
  }
  if (!baseUrl || !apiKey || !model) {
    throw new Error('AI 配置不完整');
  }

  const messages = buildMessages({
    systemPrompt: settings.ai.systemPrompt,
    userMessage: input.message.trim(),
    noteBlocks: buildNoteBlocks(input.notes),
    history: input.history,
  });

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.5,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `AI 请求失败 (${response.status})`);
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = payload.choices?.[0]?.message?.content?.trim() || '';
  if (!reply) {
    throw new Error('AI provider returned empty content.');
  }
  return {
    reply,
    model,
  };
}
