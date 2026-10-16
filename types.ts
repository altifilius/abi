export type Role = 'viewer' | 'editor' | 'reviewer' | 'admin' | 'owner';
export interface User {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
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
  project_id: string;
  call_id: string;
  call_version: number;
  profile_revision: number;
  revision: number;
  state: string;
  data: Record<string, unknown>;
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
