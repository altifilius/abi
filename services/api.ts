import type { Session } from '../types';
import { validateApiResponse } from './contracts';

const API_BASE = (import.meta.env?.VITE_API_BASE || '/api').replace(/\/$/, '');
let csrfToken = '';
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export function clearSession() {
  csrfToken = '';
}
export async function getCsrf(signal?: AbortSignal): Promise<Session> {
  const session = await apiRequest<Session>('/auth/session', { signal });
  csrfToken = session.csrf_token;
  return session;
}
async function responseError(response: Response): Promise<never> {
  let message = `Request failed (${response.status})`;
  let code: string | undefined;
  try {
    const data = await response.json();
    const detail = data.detail;
    if (typeof detail === 'string') message = detail;
    else if (Array.isArray(detail))
      message = detail
        .map(
          (item: { loc?: string[]; msg?: string }) =>
            `${(item.loc || []).filter((x) => x !== 'body').join('.')}: ${item.msg || 'Invalid value'}`,
        )
        .join('; ');
    else if (detail && typeof detail.message === 'string') {
      message = detail.message;
      code = detail.code;
    } else if (detail && typeof detail === 'object') {
      code = typeof detail.code === 'string' ? detail.code : undefined;
      const errors = Array.isArray(detail.errors)
        ? detail.errors
        : Array.isArray(data.errors)
          ? data.errors
          : [];
      const messages = errors
        .map((item: { message?: unknown; field?: unknown }) =>
          typeof item.message === 'string'
            ? `${typeof item.field === 'string' ? `${item.field}: ` : ''}${item.message}`
            : '',
        )
        .filter(Boolean);
      if (messages.length) message = messages.join('; ');
      else if (code)
        message =
          code === 'stale_revision' || code === 'stale_project'
            ? 'This project changed. Reload it before saving.'
            : code.replaceAll('_', ' ');
    } else if (Array.isArray(data.errors)) {
      const messages = data.errors
        .map((item: { message?: unknown; field?: unknown }) =>
          typeof item.message === 'string'
            ? `${typeof item.field === 'string' ? `${item.field}: ` : ''}${item.message}`
            : '',
        )
        .filter(Boolean);
      if (messages.length) message = messages.join('; ');
    }
  } catch {
    /* Never display server HTML or submitted request bodies. */
  }
  throw new ApiError(message, response.status, code);
}
async function request(path: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(method) &&
    !['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password'].includes(
      path,
    )
  ) {
    if (!csrfToken) await getCsrf(options.signal || undefined);
    headers.set('X-CSRF-Token', csrfToken);
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'same-origin',
  });
  if (!response.ok) await responseError(response);
  if (
    response.status === 204 &&
    ['/auth/change-password', '/auth/reset-password', '/auth/logout'].includes(path)
  )
    csrfToken = '';
  return response;
}
export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await request(path, options);
  if (response.status === 204) return undefined as T;
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new ApiError('Server returned invalid JSON', response.status, 'invalid_response');
  }
  try {
    validateApiResponse(path, (options?.method || 'GET').toUpperCase(), value);
  } catch {
    throw new ApiError('Server returned an invalid record', response.status, 'invalid_response');
  }
  return value as T;
}
export async function api<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...init } = options;
  if (json !== undefined) {
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json');
    init.headers = headers;
    init.body = JSON.stringify(json);
  }
  return apiRequest<T>(path, init);
}
export async function downloadFile(
  path: string,
  filename: string,
  options?: RequestInit,
): Promise<void> {
  const response = await request(path, options);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.name !== 'AbortError') return error.message;
  return '';
}
