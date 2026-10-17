import { z } from 'zod';
import type { Usage } from '../types';
import { ApiError, api, downloadFile } from './api';
import { usageContract } from './contracts';

export interface RichNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: RichNode[];
}
export interface RichDocument extends RichNode {
  type: 'doc';
}
export interface ReportSection {
  id: string;
  title: string;
  content: RichDocument;
}
export interface ProjectReport {
  id: string;
  project_id: string;
  workspace_id: string;
  template_key: string;
  title: string;
  language: string;
  call_id: string | null;
  sections: ReportSection[];
  revision: number;
  scope_revision: number;
  selected: boolean;
  position: number;
  updated_at: string;
  needs_review: boolean;
  source_url?: string | null;
}
export interface ReportMessage {
  id: string;
  report_id: string;
  role: 'user' | 'assistant';
  text: string;
  created_at: string;
  section_id?: string | null;
}
export interface ReportChatResult {
  message: ReportMessage;
  user_message: ReportMessage;
  report: ProjectReport;
  applied: boolean;
  usage?: Usage;
}
export interface ReportPatch {
  expected_revision: number;
  sections: ReportSection[];
  title?: string;
  acknowledge_scope?: boolean;
}

const richNode: z.ZodType<RichNode> = z.lazy(() =>
  z.object({
    type: z.string(),
    text: z.string().optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    marks: z
      .array(z.object({ type: z.string(), attrs: z.record(z.string(), z.unknown()).optional() }))
      .optional(),
    content: z.array(richNode).optional(),
  }),
);
export const richDocumentContract = z.object({
  type: z.literal('doc'),
  content: z.array(richNode).optional(),
});
export const reportContract = z
  .object({
    id: z.string().min(1),
    project_id: z.string().min(1),
    workspace_id: z.string().min(1),
    template_key: z.string(),
    title: z.string(),
    language: z.string(),
    call_id: z.string().nullable(),
    sections: z.array(
      z.object({ id: z.string().min(1), title: z.string(), content: richDocumentContract }),
    ),
    revision: z.number().int().nonnegative(),
    scope_revision: z.number().int().nonnegative(),
    selected: z.boolean(),
    position: z.number().int(),
    updated_at: z.string(),
    needs_review: z.boolean(),
    source_url: z.string().nullable().optional(),
  })
  .transform((report): ProjectReport => ({ ...report, call_id: report.call_id ?? null }));
const messageContract = z.object({
  id: z.string().min(1),
  report_id: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  created_at: z.string(),
  section_id: z.string().nullable().optional(),
});
function checked<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(
      'The server returned an invalid report record.',
      undefined,
      'invalid_response',
    );
  return result.data;
}
const encoded = encodeURIComponent;
export async function listReports(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectReport[]> {
  return checked(
    z.array(reportContract),
    await api(`/projects/${encoded(projectId)}/reports`, { signal }),
  );
}
export async function initializeReports(
  projectId: string,
  signal?: AbortSignal,
  language: 'tr' | 'en' = 'tr',
): Promise<ProjectReport[]> {
  return checked(
    z.array(reportContract),
    await api(`/projects/${encoded(projectId)}/reports/initialize`, {
      method: 'POST',
      headers: { 'Accept-Language': language },
      signal,
    }),
  );
}
export async function selectReports(
  projectId: string,
  ids: string[],
  signal?: AbortSignal,
): Promise<ProjectReport[]> {
  return checked(
    z.array(reportContract),
    await api(`/projects/${encoded(projectId)}/report-selection`, {
      method: 'PATCH',
      json: { ids },
      signal,
    }),
  );
}
export async function getReport(reportId: string, signal?: AbortSignal): Promise<ProjectReport> {
  return checked(reportContract, await api(`/reports/${encoded(reportId)}`, { signal }));
}
export async function saveReport(
  reportId: string,
  patch: ReportPatch,
  signal?: AbortSignal,
): Promise<ProjectReport> {
  return checked(
    reportContract,
    await api(`/reports/${encoded(reportId)}`, { method: 'PATCH', json: patch, signal }),
  );
}
export async function getReportMessages(
  reportId: string,
  signal?: AbortSignal,
): Promise<ReportMessage[]> {
  const result = checked(
    z.object({ messages: z.array(messageContract) }),
    await api(`/reports/${encoded(reportId)}/messages`, { signal }),
  );
  return result.messages;
}
export async function chatWithReport(
  reportId: string,
  input: {
    text: string;
    section_id: string;
    expected_revision: number;
    language: 'tr' | 'en';
  },
  signal?: AbortSignal,
): Promise<ReportChatResult> {
  const result = checked(
    z.object({
      message: messageContract,
      user_message: messageContract,
      report: reportContract,
      applied: z.boolean(),
      usage: usageContract.optional(),
    }),
    await api(`/reports/${encoded(reportId)}/chat`, { method: 'POST', json: input, signal }),
  );
  if (!result.report)
    throw new ApiError('The server returned no report record.', undefined, 'invalid_response');
  return { ...result, report: result.report };
}
export function exportReport(
  report: ProjectReport,
  format: 'pdf' | 'docx',
  signal?: AbortSignal,
): Promise<void> {
  const safeTitle = [...report.title]
    .map((character) => (character.charCodeAt(0) < 32 ? '-' : character))
    .join('')
    .replace(/[\\/:*?"<>|]/g, '-')
    .trim();
  const filename = `${safeTitle || 'report'}.${format}`;
  return downloadFile(`/reports/${encoded(report.id)}/export?format=${format}`, filename, {
    method: 'POST',
    signal,
  });
}
export function emptyReportDocument(): RichDocument {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}
export function reportHasContent(report: ProjectReport): boolean {
  const containsText = (node: RichNode): boolean =>
    Boolean(node.text?.trim()) || Boolean(node.content?.some(containsText));
  return report.sections.some((section) => containsText(section.content));
}
export function safeReportSource(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
