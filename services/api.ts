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
    let detail = `${response.status} ${response.statusText}`;
    try {
      const data = await response.json();
      if (data?.detail) {
        detail = data.detail;
      }
    } catch {
      detail = await response.text();
    }
    throw new Error(detail || 'Request failed');
  }

  return response.json() as Promise<T>;
}

export async function sendIdeaChat(messages: ChatMessage[]): Promise<string> {
  const data = await postJson<{ reply: string }>('/idea-chat', {
    messages: toApiMessages(messages),
    mode: 'chat',
  });
  return data.reply;
}

export async function generateIdeaSummary(messages: ChatMessage[]): Promise<string> {
  const data = await postJson<{ reply: string }>('/idea-chat', {
    messages: toApiMessages(messages),
    mode: 'summary',
  });
  return data.reply;
}

export async function runFundMatcher(description: string): Promise<FundMatch[]> {
  const data = await postJson<{ matches: FundMatch[] }>('/fund-matcher', {
    description,
  });
  return data.matches || [];
}
