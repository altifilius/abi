export const PROJECT_SECTIONS = [
  'overview',
  'profile',
  'draft',
  'budget',
  'eligibility',
  'history',
] as const;
export const APPLICATION_SECTIONS = [
  'overview',
  'text',
  'budget',
  'documents',
  'checks',
  'review',
  'package',
] as const;
export const WORKSPACE_SECTIONS = [
  'info',
  'team',
  'ai',
  'usage',
  'privacy',
  'incorporation',
  'activity',
] as const;
export const ACCOUNT_SECTIONS = ['identity', 'security', 'preferences', 'privacy'] as const;
export const ADMIN_SECTIONS = ['sources', 'programs', 'entitlements', 'operations'] as const;

export interface ProductRoute {
  menu:
    | 'projects'
    | 'funding'
    | 'applications'
    | 'documents'
    | 'tasks'
    | 'calendar'
    | 'workspace'
    | 'workspace-create'
    | 'notifications'
    | 'account'
    | 'admin'
    | 'help'
    | 'auth'
    | 'not-found';
  reportId?: string;
  aiMode?: 'idea' | 'reports';
  workspaceId?: string;
  projectId?: string;
  applicationId?: string;
  programId?: string;
  callId?: string;
  section?: string;
}

export function parseProductRoute(pathname: string): ProductRoute {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 1 && parts[0] === 'notifications') return { menu: 'notifications' };
  if (parts.length === 1 && parts[0] === 'help') return { menu: 'help' };
  if (parts.length === 2 && parts[0] === 'workspaces' && parts[1] === 'new')
    return { menu: 'workspace-create' };
  if (
    parts.length === 2 &&
    parts[0] === 'account' &&
    ACCOUNT_SECTIONS.some((section) => section === parts[1])
  )
    return { menu: 'account', section: parts[1] };
  if (
    parts.length === 2 &&
    parts[0] === 'admin' &&
    ADMIN_SECTIONS.some((section) => section === parts[1])
  )
    return { menu: 'admin', section: parts[1] };
  if (
    parts.length === 2 &&
    parts[0] === 'auth' &&
    ['forgot-password', 'reset-password'].includes(parts[1])
  )
    return { menu: 'auth', section: parts[1] };
  if (parts[0] !== 'w' || !parts[1]) return { menu: 'not-found' };
  const workspaceId = parts[1];
  const menu = parts[2];
  if (
    parts.length === 3 &&
    ['projects', 'funding', 'applications', 'documents', 'tasks', 'calendar'].includes(menu)
  )
    return { menu: menu as ProductRoute['menu'], workspaceId };
  if (
    parts.length === 6 &&
    menu === 'projects' &&
    parts[4] === 'ai' &&
    ['idea', 'reports'].includes(parts[5])
  )
    return {
      menu: 'projects',
      workspaceId,
      projectId: parts[3],
      section: 'ai',
      aiMode: parts[5] as 'idea' | 'reports',
    };
  if (parts.length === 6 && menu === 'projects' && parts[4] === 'reports')
    return {
      menu: 'projects',
      workspaceId,
      projectId: parts[3],
      section: 'report',
      reportId: parts[5],
    };
  if (
    parts.length === 5 &&
    menu === 'projects' &&
    PROJECT_SECTIONS.some((section) => section === parts[4])
  )
    return { menu: 'projects', workspaceId, projectId: parts[3], section: parts[4] };
  if (
    parts.length === 5 &&
    menu === 'applications' &&
    APPLICATION_SECTIONS.some((section) => section === parts[4])
  )
    return { menu: 'applications', workspaceId, applicationId: parts[3], section: parts[4] };
  if (parts.length === 5 && menu === 'funding' && parts[3] === 'programs')
    return { menu: 'funding', workspaceId, programId: parts[4] };
  if (parts.length === 5 && menu === 'funding' && parts[3] === 'calls')
    return { menu: 'funding', workspaceId, callId: parts[4] };
  if (
    parts.length === 4 &&
    menu === 'workspace' &&
    WORKSPACE_SECTIONS.some((section) => section === parts[3])
  )
    return { menu: 'workspace', workspaceId, section: parts[3] };
  return { menu: 'not-found' };
}

export function canEditWorkspace(role?: string): boolean {
  return role === 'owner' || role === 'admin' || role === 'reviewer' || role === 'editor';
}

export function canReviewWorkspace(role?: string): boolean {
  return role === 'owner' || role === 'admin' || role === 'reviewer';
}
