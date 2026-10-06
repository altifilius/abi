import type { ChatMessage, FundMatch } from '../types';

const DEFAULT_API_BASE = '/api';
const API_BASE = (import.meta.env.VITE_API_BASE || DEFAULT_API_BASE).replace(/\/$/, '');

export class ApiError extends Error {
  readonly kind: 'http' | 'parse' | 'contract';
  readonly status?: number;

  constructor(message: string, kind: 'http' | 'parse' | 'contract', status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

const toApiMessages = (messages: ChatMessage[]) =>
  messages.map(({ role, text }) => ({
    role,
    text,
  }));

const isObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null && !Array.isArray(val);

export function parseIdeaChatResponse(data: unknown): { reply: string } {
  if (!isObject(data) || typeof data.reply !== 'string') {
    throw new ApiError('Invalid idea-chat response: expected { reply: string }', 'contract');
  }
  return { reply: data.reply };
}

export function parseFundMatch(data: unknown): FundMatch {
  if (!isObject(data)) {
    throw new ApiError('Invalid fund match item: expected an object', 'contract');
  }
  const { fundId, score, rationale, eligibilityStatus } = data;
  if (typeof fundId !== 'string' || !fundId.trim()) {
    throw new ApiError('Invalid fund match item: missing or invalid fundId', 'contract');
  }
  if (typeof score !== 'number' || Number.isNaN(score) || score < 0 || score > 100) {
    throw new ApiError('Invalid fund match item: score must be between 0 and 100', 'contract');
  }
  if (typeof rationale !== 'string') {
    throw new ApiError('Invalid fund match item: rationale must be a string', 'contract');
  }
  if (
    eligibilityStatus !== 'eligible' &&
    eligibilityStatus !== 'conditional' &&
    eligibilityStatus !== 'ineligible'
  ) {
    throw new ApiError('Invalid fund match item: invalid eligibilityStatus', 'contract');
  }
  return {
    fundId,
    score,
    rationale,
    eligibilityStatus,
  };
}

export function parseFundMatcherResponse(data: unknown): { matches: FundMatch[] } {
  if (!isObject(data) || !Array.isArray(data.matches)) {
    throw new ApiError(
      'Invalid fund-matcher response: expected { matches: FundMatch[] }',
      'contract',
    );
  }
  return {
    matches: data.matches.map(parseFundMatch),
  };
}

async function postJson<T>(
  path: string,
  body: unknown,
  validate: (data: unknown) => T,
): Promise<T> {
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
      if (parsed?.detail) {
        detail = typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail);
      }
    } catch {
      if (raw) detail = raw;
    }
    throw new ApiError(detail || 'Request failed', 'http', response.status);
  }

  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError('Server returned invalid JSON', 'parse', response.status);
  }

  return validate(json);
}
export type IdeaChatOptions = {
  language?: string;
  projectContext?: string;
};

export async function sendIdeaChat(
  messages: ChatMessage[],
  options: IdeaChatOptions = {},
): Promise<string> {
  const data = await postJson(
    '/idea-chat',
    {
      messages: toApiMessages(messages),
      mode: 'chat',
      language: options.language,
      project_context: options.projectContext,
    },
    parseIdeaChatResponse,
  );
  return data.reply;
}

export async function generateIdeaSummary(
  messages: ChatMessage[],
  options: IdeaChatOptions = {},
): Promise<string> {
  const data = await postJson(
    '/idea-chat',
    {
      messages: toApiMessages(messages),
      mode: 'summary',
      language: options.language,
      project_context: options.projectContext,
    },
    parseIdeaChatResponse,
  );
  return data.reply;
}

export async function streamIdeaChat(
  messages: ChatMessage[],
  options: IdeaChatOptions,
  onChunk: (chunk: string) => void,
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
      if (data?.detail) {
        detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
      }
    } catch {
      detail = await response.text();
    }
    throw new ApiError(detail || 'Stream request failed', 'http', response.status);
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
  const data = await postJson(
    '/fund-matcher',
    {
      description,
    },
    parseFundMatcherResponse,
  );
  return data.matches;
}
