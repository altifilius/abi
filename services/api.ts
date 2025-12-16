import { ChatMessage, FundMatch } from '../types';

const DEFAULT_API_BASE = '/api';
const API_BASE = (import.meta.env.VITE_API_BASE || DEFAULT_API_BASE).replace(/\/$/, '');

const toApiMessages = (messages: ChatMessage[]) =>
  messages.map(({ role, text }) => ({
    role,
    text,
  }));

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const raw = await response.text();
    let detail = `${response.status} ${response.statusText}`;
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.detail) detail = parsed.detail;
    } catch {
      if (raw) detail = raw;
    }
    throw new Error(detail || 'Request failed');
  }

  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export type IdeaChatOptions = {
  language?: string;
  projectContext?: string;
};

export async function sendIdeaChat(
  messages: ChatMessage[],
  options: IdeaChatOptions = {}
): Promise<string> {
  const data = await postJson<{ reply: string }>('/idea-chat', {
    messages: toApiMessages(messages),
    mode: 'chat',
    language: options.language,
    project_context: options.projectContext,
  });
  return data.reply;
}

export async function generateIdeaSummary(
  messages: ChatMessage[],
  options: IdeaChatOptions = {}
): Promise<string> {
  const data = await postJson<{ reply: string }>('/idea-chat', {
    messages: toApiMessages(messages),
    mode: 'summary',
    language: options.language,
    project_context: options.projectContext,
  });
  return data.reply;
}

export async function streamIdeaChat(
  messages: ChatMessage[],
  options: IdeaChatOptions,
  onChunk: (chunk: string) => void
): Promise<string> {
  const response = await fetch(`${API_BASE}/idea-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: toApiMessages(messages),
      mode: 'chat',
      language: options.language,
      project_context: options.projectContext,
      stream: true,
    }),
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const data = await response.json();
      if (data?.detail) detail = data.detail;
    } catch {
      detail = await response.text();
    }
    throw new Error(detail || 'Stream request failed');
  }

  if (!response.body) {
    throw new Error('Streaming not supported by the browser/response');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let acc = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) {
      acc += chunk;
      onChunk(acc);
    }
  }
  return acc;
}

export async function runFundMatcher(description: string): Promise<FundMatch[]> {
  const data = await postJson<{ matches: FundMatch[] }>('/fund-matcher', {
    description,
  });
  return data.matches || [];
}
