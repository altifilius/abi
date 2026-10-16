import { z } from 'zod';

const role = z.enum(['viewer', 'editor', 'reviewer', 'admin', 'owner']);
const money = z.string().regex(/^\d+(?:\.\d+)?$/);
const budget = z.object({
  currency: z.string().min(3),
  items: z.array(
    z.object({
      id: z.string().min(1),
      category: z.enum(['personnel', 'equipment', 'services', 'travel', 'materials', 'other']),
      description: z.string(),
      amount: money,
    }),
  ),
});
export const userContract = z.object({
  id: z.string().min(1),
  email: z.string(),
  name: z.string(),
  is_admin: z.boolean(),
  email_verified_at: z.string().nullable().optional(),
});
export const workspaceContract = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: z.enum(['personal', 'company']),
  country: z.string(),
  plan: z.enum(['free', 'pro']),
  ai_policy: z.enum(['local', 'external']),
  profile: z.record(z.string(), z.unknown()),
  role: role.optional(),
});
export const projectContract = z.object({
  id: z.string().min(1),
  workspace_id: z.string().min(1),
  title: z.string(),
  description: z.string(),
  profile: z.record(z.string(), z.unknown()),
  revision: z.number().int().positive(),
  confirmed_revision: z.number().int().positive().nullable(),
  stage: z.string(),
});
export const sessionContract = z.object({
  user: userContract,
  csrf_token: z.string().min(1),
  workspaces: z.array(workspaceContract),
});
const usageCounter = z.object({
  limit: z.number().int().nonnegative(),
  base_limit: z.number().int().nonnegative(),
  extra_credits: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});
export const usageContract = z.object({
  month: z.string(),
  plan: z.enum(['free', 'pro']),
  scope: z.enum(['user', 'workspace']),
  chat: usageCounter,
  write: usageCounter,
});
export const applicationContract = z.object({
  id: z.string().min(1),
  workspace_id: z.string().min(1),
  project_id: z.string().min(1),
  call_id: z.string().min(1),
  call_version: z.number().int().positive(),
  source_revision_id: z.string(),
  rule_version: z.string(),
  profile_revision: z.number().int().positive(),
  revision: z.number().int().positive(),
  state: z.enum(['draft', 'review_requested', 'approved']),
  language: z.string(),
  template: z.object({
    sections: z.array(z.object({ key: z.string(), label: z.string(), required: z.boolean() })),
    documents: z.array(z.object({ key: z.string(), label: z.string(), required: z.boolean() })),
    guidance: z.array(z.object({ title: z.string(), text: z.string(), url: z.string() })),
  }),
  data: z.object({
    sections: z.record(z.string(), z.string()),
    attachments: z.record(z.string(), z.string()),
    budget,
  }),
});

export function validateApiResponse(path: string, method: string, value: unknown): void {
  const cleanPath = path.split('?')[0];
  let schema: z.ZodType | undefined;
  if (
    cleanPath === '/auth/session' ||
    cleanPath === '/auth/login' ||
    cleanPath === '/auth/register'
  )
    schema = sessionContract;
  else if (cleanPath === '/auth/profile') schema = userContract;
  else if (cleanPath === '/workspaces')
    schema = method === 'GET' ? z.array(workspaceContract) : workspaceContract;
  else if (/^\/workspaces\/[^/]+\/projects$/.test(cleanPath))
    schema = method === 'GET' ? z.array(projectContract) : projectContract;
  else if (
    /^\/projects\/[^/]+$/.test(cleanPath) ||
    /^\/projects\/[^/]+\/import-legacy$/.test(cleanPath)
  )
    schema = projectContract;
  else if (/^\/workspaces\/[^/]+\/usage$/.test(cleanPath)) schema = usageContract;
  else if (/^\/workspaces\/[^/]+$/.test(cleanPath)) schema = workspaceContract;
  else if (
    /^\/applications\/[^/]+$/.test(cleanPath) ||
    /^\/applications\/[^/]+\/(submit-review|approve|import-project-budget)$/.test(cleanPath)
  )
    schema = applicationContract;
  else if (
    /^\/projects\/[^/]+\/applications$/.test(cleanPath) ||
    /^\/workspaces\/[^/]+\/applications$/.test(cleanPath)
  )
    schema = method === 'GET' ? z.array(applicationContract) : applicationContract;
  if (schema && !schema.safeParse(value).success)
    throw new Error('The server response does not match the expected record contract');
}
