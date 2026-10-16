export type Role = 'viewer' | 'editor' | 'reviewer' | 'admin' | 'owner';
export interface User {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  email_verified_at?: string | null;
}
export interface Workspace {
  id: string;
  name: string;
  kind: 'personal' | 'company';
  country: string;
  plan: 'free' | 'pro';
  ai_policy: 'local' | 'external';
  profile: Record<string, unknown>;
  role?: Role;
}
export interface BudgetItem {
  id: string;
  category: 'personnel' | 'equipment' | 'services' | 'travel' | 'materials' | 'other';
  description: string;
  amount: string;
}
export interface Profile {
  company?: Record<string, unknown>;
  project?: Record<string, unknown>;
  team?: Record<string, unknown>;
  budget?: { currency: string; items: BudgetItem[] };
  extra?: Record<string, unknown>;
}
export interface Project {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  profile: Profile;
  revision: number;
  confirmed_revision: number | null;
  stage: string;
  updated_at?: string;
}
export interface ChatMessage {
  id: string;
  project_id: string;
  role: 'user' | 'assistant';
  text: string;
  created_at: string;
}
export interface Session {
  user: User;
  csrf_token: string;
  workspaces: Workspace[];
}
export interface UsageCounter {
  limit: number;
  base_limit: number;
  extra_credits: number;
  used: number;
  reserved: number;
  remaining: number;
}
export interface Usage {
  month: string;
  plan: 'free' | 'pro';
  scope: 'user' | 'workspace';
  chat: UsageCounter;
  write: UsageCounter;
}
export interface Application {
  id: string;
  workspace_id: string;
  project_id: string;
  project_title?: string;
  call_id: string;
  call_title?: string;
  program_name?: string;
  responsible_id?: string | null;
  responsible_name?: string | null;
  call_version: number;
  source_revision_id: string;
  rule_version: string;
  profile_revision: number;
  revision: number;
  state: 'draft' | 'review_requested' | 'approved';
  language: string;
  template: {
    sections: {
      key: string;
      label: string;
      required: boolean;
      source_url?: string;
      source_locator?: string;
      profile_field?: string;
      max_characters?: number;
    }[];
    documents: {
      key: string;
      label: string;
      required: boolean;
      accepted_extensions?: string[];
      source_url?: string;
      source_locator?: string;
    }[];
    guidance: { title: string; text: string; url: string }[];
    official_template_url?: string | null;
    language?: string;
  };
  data: {
    sections: Record<string, string>;
    attachments: Record<string, string>;
    budget: { currency: string; items: BudgetItem[] };
  };
  created_at?: string;
}
export interface Task {
  id: string;
  workspace_id: string;
  project_id: string;
  project_title?: string;
  title: string;
  description?: string | null;
  assignee_id: string | null;
  assignee_name?: string | null;
  application_id: string | null;
  application_title?: string | null;
  document_id: string | null;
  document_name?: string | null;
  due_at: string | null;
  status: 'open' | 'in_progress' | 'done';
  created_at: string;
  updated_at: string;
}
export interface StoredDocument {
  id: string;
  workspace_id: string;
  project_id: string;
  project_title?: string;
  original_name: string;
  mime: string;
  size: number;
  sha256: string;
  status: string;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
  text_preview?: string;
  used_by?: { id: string; call_title?: string; state: string }[];
}
export interface CalendarEvent {
  id: string;
  kind: 'task' | 'deadline' | 'opening';
  title: string;
  start_at: string;
  end_at?: string;
  project_id?: string;
  call_id?: string;
  task_id?: string;
  application_id?: string;
  source_url?: string;
}
export interface Operation {
  id: string;
  workspace_id?: string | null;
  project_id?: string | null;
  operation: string;
  status: string;
  created_at: string;
  completed_at?: string | null;
  expires_at?: string;
  error_code?: string | null;
}
export interface AdminWorkspace {
  id: string;
  name: string;
  kind: string;
  country: string;
  plan: 'free' | 'pro';
  member_count: number;
  created_at: string;
}
export const COUNTRIES = [
  'TR',
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'GB',
  'US',
  'CA',
  'CH',
  'NO',
  'IS',
  'LI',
] as const;
