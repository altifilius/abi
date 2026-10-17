import type { FundingCall, FundingProgram, FundingSource } from '../components/FundingCatalog';
import type { Application } from '../types';
import { api } from './api';

export type FundingClassification = 'domestic' | 'direct' | 'establish' | 'unknown';
export interface FundingCondition {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'missing' | 'review';
  field: string;
  actual: unknown;
  expected: unknown;
  source_url: string | null;
  source_locator: string;
}
export interface FundingRecommendation {
  reason: string;
  missing_information: string[];
  classification: FundingClassification;
  source_urls: string[];
  country_evidence: { label: string; source_url: string; source_locator: string }[];
  conditions: FundingCondition[];
  recommended: boolean;
  preparation_only: boolean;
}
export interface DiscoveryProgram extends FundingProgram {
  recommendation?: FundingRecommendation;
  source?: FundingSource | null;
}
export interface FundingDiscovery {
  country: string | null;
  country_source: string | null;
  items: DiscoveryProgram[];
  unclassified_count: number;
}
export interface FundingSelection {
  id: string;
  project_id: string;
  workspace_id: string;
  call_id: string;
  program_name: string;
  call_title: string;
  call_state: string;
  template: Application['template'];
  source_url: string;
  report_id: string | null;
  preparation_only: boolean;
}
export interface FundingDetail {
  program: FundingProgram;
  call: FundingCall | null;
  recommendation?: FundingRecommendation;
}

export function discoverFunding(projectId: string, params: URLSearchParams, signal?: AbortSignal) {
  return api<FundingDiscovery>(
    `/projects/${encodeURIComponent(projectId)}/funding-discovery?${params}`,
    { signal },
  );
}
export function exploreFunding(params: URLSearchParams, signal?: AbortSignal) {
  return api<FundingProgram[]>(`/programs?${params}`, { signal });
}
export function getFundingSelections(projectId: string, signal?: AbortSignal) {
  return api<FundingSelection[]>(`/projects/${encodeURIComponent(projectId)}/funding-selections`, {
    signal,
  });
}
export function addFundingSelection(projectId: string, callId: string) {
  return api<FundingSelection>(`/projects/${encodeURIComponent(projectId)}/funding-selections`, {
    method: 'POST',
    json: { call_id: callId },
  });
}
export async function getFundingDetail(
  programId: string | undefined,
  callId: string | undefined,
  signal?: AbortSignal,
): Promise<FundingDetail> {
  const requested = callId
    ? await api<FundingCall>(`/calls/${encodeURIComponent(callId)}`, { signal })
    : null;
  const id = programId || requested?.program_id;
  if (!id) throw new Error('Program not found.');
  const program = await api<FundingProgram>(`/programs/${encodeURIComponent(id)}`, { signal });
  const calls = program.calls || [];
  const call =
    requested ||
    calls.find((item) => item.status === 'published') ||
    calls.find((item) => item.status !== 'archived') ||
    calls[0] ||
    null;
  return { program, call };
}
