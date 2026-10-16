import type { Application } from '../types';
import type { Budget } from './BudgetEditor';

export interface ApplicationData {
  sections: Record<string, string>;
  attachments: Record<string, string>;
  budget: Budget;
}
export interface ApplicationTemplate {
  language?: string;
  sections?: {
    key: string;
    label: string;
    required: boolean;
    source_url?: string;
    source_locator?: string;
    max_characters?: number | null;
  }[];
  documents?: {
    key: string;
    label: string;
    required: boolean;
    source_url?: string;
    source_locator?: string | null;
    accepted_extensions?: string[];
  }[];
  guidance?: { title: string; text: string; url: string }[];
  official_template_url?: string | null;
  official_template_required?: boolean;
  submission_mode?: string;
  package_label?: string;
}
export interface ApplicationCall {
  id: string;
  program_id: string;
  title: string;
  version: number;
  status: string;
  language: string;
  deadline: string | null;
  opens_at: string | null;
  source_revision_id: string;
  rule_version: string;
  portal_url?: string | null;
  finance: {
    currency: string;
    notes?: string;
    source_url?: string;
    budget_required?: boolean;
    requires_national_confirmation?: boolean;
  };
  template: ApplicationTemplate;
}
export type ApplicationRecord = Application & {
  workspace_id?: string;
  call_title?: string;
  project_title?: string;
  program_name?: string;
  deadline?: string | null;
  source_revision_id?: string;
  rule_version?: string;
  language?: string | null;
  template?: ApplicationTemplate;
  created_at?: string;
};
export interface ApplicationDocument {
  id: string;
  original_name: string;
  status: string;
  size: number;
  sha256: string;
  verified_by: string | null;
  verified_at: string | null;
}
export interface ApplicationCheck {
  errors: { code: string; message: string; field?: string }[];
  warnings: ({ code?: string; field?: string; message?: string } | string)[];
  budget?: Record<string, string | null>;
  ready_for_review: boolean;
  application_revision: number;
  language?: string | null;
}

// Object property order is not part of the saved application content; array order is.
export function canonicalApplicationData(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalApplicationData).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalApplicationData(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

// Compare source/evaluation budgets without converting money to JavaScript numbers.
export function applicationBudgetsEqual(left: Budget, right: Budget | undefined): boolean {
  if (!right || left.currency !== right.currency || left.items.length !== right.items.length)
    return false;
  const normalized = (budget: Budget) =>
    budget.items
      .map((item) => {
        if (!/^\d+(?:\.\d+)?$/.test(item.amount)) return null;
        const [whole, fraction = ''] = item.amount.split('.');
        if (fraction.slice(2).replaceAll('0', '')) return null;
        const cents = `${whole.replace(/^0+(?=\d)/, '')}.${fraction.slice(0, 2).padEnd(2, '0')}`;
        return {
          id: item.id,
          category: item.category,
          description: item.description,
          amount: cents,
        };
      })
      .sort((a, b) => (a?.id || '').localeCompare(b?.id || ''));
  const first = normalized(left);
  const second = normalized(right);
  return (
    !first.includes(null) &&
    !second.includes(null) &&
    canonicalApplicationData(first) === canonicalApplicationData(second)
  );
}
