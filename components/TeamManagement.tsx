import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnsavedChanges } from '../contexts/NavigationGuard';
import { useI18n } from '../i18n';
import { api, errorMessage } from '../services/api';
import type { Role, Session, Workspace } from '../types';

interface Member {
  user_id: string;
  name: string;
  email: string;
  email_verified_at: string | null;
  role: Role;
}
interface Invitation {
  id: string;
  email: string;
  role: Exclude<Role, 'owner'>;
  invited_by: string;
  expires_at: string;
  created_at: string;
}
const roleNames: Record<Role, [string, string]> = {
  viewer: ['Görüntüleyici', 'Viewer'],
  editor: ['Düzenleyici', 'Editor'],
  reviewer: ['İnceleyici', 'Reviewer'],
  admin: ['Yönetici', 'Admin'],
  owner: ['Sahip', 'Owner'],
};

function MemberRow({
  member,
  workspace,
  lastOwner,
  busy,
  onRole,
  onRemove,
}: {
  member: Member;
  workspace: Workspace;
  lastOwner: boolean;
  busy: boolean;
  onRole: (member: Member, role: Role) => Promise<void>;
  onRemove: (member: Member) => Promise<void>;
}) {
  const { text } = useI18n();
  const [role, setRole] = useState(member.role);
  const owner = workspace.role === 'owner';
  const manageable =
    owner || (workspace.role === 'admin' && member.role !== 'owner' && member.role !== 'admin');
  useEffect(() => setRole(member.role), [member.role]);
  return (
    <article className="panel stack">
      <h3>{member.name}</h3>
      <p>
        {member.email} · {text(...roleNames[member.role])} ·{' '}
        {member.email_verified_at
          ? text('E-posta doğrulandı', 'Email verified')
          : text('E-posta doğrulanmadı', 'Email unverified')}
      </p>
      {manageable && (
        <div className="actions">
          <label>
            {text('Yeni rol', 'New role')}
            <select
              aria-label={`${member.name}: ${text('rol', 'role')}`}
              value={role}
              disabled={busy || lastOwner}
              onChange={(event) => setRole(event.target.value as Role)}
            >
              {(owner
                ? ['viewer', 'editor', 'reviewer', 'admin', 'owner']
                : ['viewer', 'editor', 'reviewer']
              ).map((value) => (
                <option key={value} value={value}>
                  {text(...roleNames[value as Role])}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || lastOwner || role === member.role}
            onClick={() => {
              const prompt =
                role === 'owner'
                  ? text(
                      `${member.name} yeni sahip olarak atansın mı? Mevcut sahiplik korunur. Sonrasında kendi rolünüzü ayrıca değiştirebilirsiniz.`,
                      `Appoint ${member.name} as another owner? Existing ownership is retained. You may separately change your own role afterwards.`,
                    )
                  : text(
                      `${member.name} için rol değiştirilsin mi?`,
                      `Change the role for ${member.name}?`,
                    );
              if (window.confirm(prompt)) void onRole(member, role);
            }}
          >
            {role === 'owner'
              ? text('Yeni sahip ata', 'Appoint another owner')
              : text('Rolü uygula', 'Apply role')}
          </button>
          <button
            type="button"
            disabled={busy || lastOwner}
            onClick={() => {
              if (
                window.confirm(
                  text(
                    `${member.name} çalışma alanından çıkarılsın mı?`,
                    `Remove ${member.name} from the workspace?`,
                  ),
                )
              )
                void onRemove(member);
            }}
          >
            {text('Üyeyi çıkar', 'Remove member')}
          </button>
        </div>
      )}
      {lastOwner && (
        <p>
          {text(
            'Bu kişi son çalışma alanı sahibidir; çıkarılamaz veya rolü düşürülemez. Önce başka bir üyeyi sahip olarak atayın.',
            'This is the last workspace owner and cannot be removed or demoted. Appoint another member as owner first.',
          )}
        </p>
      )}
    </article>
  );
}

export default function TeamManagement({
  workspace,
  onChanged,
}: {
  workspace: Workspace;
  onChanged: () => Promise<void>;
}) {
  const { text } = useI18n();
  const manage = workspace.role === 'owner' || workspace.role === 'admin';
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [verified, setVerified] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<Role, 'owner'>>('editor');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [status, setStatus] = useState('');
  const activeLoad = useRef<AbortController | null>(null);
  const scope = useRef<{ workspaceId: string; controller: AbortController } | null>(null);
  useUnsavedChanges(Boolean(email), () => {
    setEmail('');
    setRole('editor');
  });
  useEffect(() => {
    if (workspace.role !== 'owner' && role === 'admin') setRole('editor');
  }, [workspace.role, role]);
  useEffect(() => {
    const active = { workspaceId: workspace.id, controller: new AbortController() };
    scope.current = active;
    setBusy(false);
    setStatus('');
    setMutationError('');
    return () => active.controller.abort();
  }, [workspace.id]);
  const loadTeam = useCallback(async () => {
    const active = scope.current;
    if (active?.workspaceId !== workspace.id || active.controller.signal.aborted) return;
    activeLoad.current?.abort();
    const controller = new AbortController();
    activeLoad.current = controller;
    setLoading(true);
    setError('');
    setMembers(null);
    setInvitations(null);
    await Promise.all([
      api<Member[]>(`/workspaces/${workspace.id}/members`, { signal: controller.signal }),
      manage
        ? api<Invitation[]>(`/workspaces/${workspace.id}/invitations`, {
            signal: controller.signal,
          })
        : Promise.resolve(null),
      manage ? api<Session>('/auth/session', { signal: controller.signal }) : Promise.resolve(null),
    ])
      .then(([directory, pending, session]) => {
        if (!controller.signal.aborted) {
          setMembers(directory);
          setInvitations(pending);
          setVerified(Boolean(session?.user.email_verified_at));
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, [workspace.id, manage]);
  useEffect(() => {
    void loadTeam();
    return () => activeLoad.current?.abort();
  }, [loadTeam]);
  const pending =
    invitations?.filter((invitation) => Date.parse(invitation.expires_at) > Date.now()) || [];
  const seats = (members?.length || 0) + pending.length;
  const ownerCount = members?.filter((member) => member.role === 'owner').length || 0;
  async function mutate(path: string, method: string, json: unknown, message: string) {
    const active = scope.current;
    if (active?.workspaceId !== workspace.id || active.controller.signal.aborted) return false;
    const signal = active.controller.signal;
    setBusy(true);
    setError('');
    setMutationError('');
    setStatus('');
    try {
      await api(path, { method, signal, ...(json === undefined ? {} : { json }) });
      if (signal.aborted) return false;
      await onChanged();
      if (signal.aborted) return false;
      await loadTeam();
      if (signal.aborted) return false;
      setStatus(message);
      return true;
    } catch (reason) {
      if (signal.aborted) return false;
      setMutationError(errorMessage(reason));
      await onChanged().catch(() => undefined);
      if (!signal.aborted) await loadTeam();
      return false;
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="stack">
      <h2>{text('Ekip', 'Team')}</h2>
      <p>
        {text(
          'Üye dizini için proje seçimi gerekmez. Roller ve davetler yalnızca bu çalışma alanını etkiler.',
          'The member directory does not require a project. Roles and invitations affect only this workspace.',
        )}
      </p>
      {!manage && (
        <p>
          {text(
            'Üye dizini salt okunurdur. Davet ve rol yönetimi sahip veya yönetici gerektirir.',
            'The member directory is read-only. Invitations and role management require an owner or admin.',
          )}
        </p>
      )}
      {manage && members && invitations && (
        <p>
          {text(
            'Kullanılan koltuklar (üyeler + geçerli bekleyen davetler)',
            'Occupied seats (members + valid pending invitations)',
          )}
          : {seats} / {workspace.plan === 'pro' ? 3 : 1}
        </p>
      )}
      {loading && <p role="status">{text('Ekip yükleniyor…', 'Loading team…')}</p>}
      {members?.map((member) => (
        <MemberRow
          key={member.user_id}
          member={member}
          workspace={workspace}
          busy={busy || loading}
          lastOwner={member.role === 'owner' && ownerCount === 1}
          onRole={async (target, selected) => {
            await mutate(
              `/workspaces/${workspace.id}/members/${target.user_id}`,
              'PATCH',
              { role: selected },
              selected === 'owner'
                ? text(
                    'Yeni sahip atandı. Gerekirse kendi rolünüzü ayrıca değiştirin.',
                    'Another owner was appointed. Separately change your own role if needed.',
                  )
                : text('Üye rolü güncellendi.', 'Member role updated.'),
            );
          }}
          onRemove={async (target) => {
            await mutate(
              `/workspaces/${workspace.id}/members/${target.user_id}`,
              'DELETE',
              undefined,
              text('Üye çıkarıldı.', 'Member removed.'),
            );
          }}
        />
      ))}
      {manage && (
        <section className="panel stack">
          <h3>{text('Davetler', 'Invitations')}</h3>
          <p>
            {text(
              'Pro en fazla üç koltuk sağlar; bekleyen davetler de sayılır. Davet eden kişinin doğrulanmış e-postası ve güncel yönetim yetkisi gerekir. Daveti kabul eden kişi aynı e-posta ile giriş yapmalı ve e-postasını doğrulamalıdır.',
              'Pro provides up to three seats, including pending invitations. The inviter needs verified email and current management permission. Invitees must sign in and verify the invited email address.',
            )}
          </p>
          {workspace.plan !== 'pro' && (
            <p>
              {text(
                'Yeni ekip davetleri Pro çalışma alanı gerektirir. Ödeme veya yükseltme satışı burada yapılmaz.',
                'New team invitations require a Pro workspace. Payments and upgrade sales are not offered here.',
              )}
            </p>
          )}
          {!verified && (
            <p>
              <Link to="/account/identity">
                {text(
                  'Davet göndermeden önce e-postanızı doğrulayın',
                  'Verify your email before inviting',
                )}
              </Link>
            </p>
          )}
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                await mutate(
                  `/workspaces/${workspace.id}/members`,
                  'POST',
                  { email, role },
                  text(
                    'Davet gönderildi; koltuk kabul veya sona erme zamanına kadar ayrıldı.',
                    'Invitation sent; its seat is reserved until acceptance or expiry.',
                  ),
                )
              )
                setEmail('');
            }}
          >
            <label>
              {text('Davet edilecek e-posta', 'Invite email')}
              <input
                required
                type="email"
                maxLength={320}
                value={email}
                disabled={busy || loading || workspace.plan !== 'pro' || !verified || seats >= 3}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              {text('Davet rolü', 'Invitation role')}
              <select
                value={role}
                disabled={busy || loading || workspace.plan !== 'pro' || !verified || seats >= 3}
                onChange={(event) => setRole(event.target.value as Exclude<Role, 'owner'>)}
              >
                {(workspace.role === 'owner'
                  ? ['viewer', 'editor', 'reviewer', 'admin']
                  : ['viewer', 'editor', 'reviewer']
                ).map((value) => (
                  <option key={value} value={value}>
                    {text(...roleNames[value as Role])}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={
                busy ||
                loading ||
                !members ||
                !invitations ||
                workspace.plan !== 'pro' ||
                !verified ||
                seats >= 3
              }
            >
              {text('Gerçek e-posta daveti gönder', 'Send email invitation')}
            </button>
          </form>
          {pending.map((invitation) => (
            <article key={invitation.id} className="panel">
              <p>
                {invitation.email} · {text(...roleNames[invitation.role])}
              </p>
              <p>
                {text('Sona erme (UTC)', 'Expires (UTC)')}:{' '}
                <time dateTime={invitation.expires_at}>
                  {new Date(invitation.expires_at).toISOString()}
                </time>
              </p>
              <button
                disabled={
                  busy || loading || (invitation.role === 'admin' && workspace.role !== 'owner')
                }
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      text(
                        'Bu davet iptal edilsin ve ayrılan koltuk serbest bırakılsın mı?',
                        'Revoke this invitation and release its reserved seat?',
                      ),
                    )
                  )
                    void mutate(
                      `/workspaces/${workspace.id}/invitations/${invitation.id}`,
                      'DELETE',
                      undefined,
                      text('Davet iptal edildi.', 'Invitation revoked.'),
                    );
                }}
              >
                {text('Daveti iptal et', 'Revoke invitation')}
              </button>
            </article>
          ))}
          {invitations && pending.length === 0 && (
            <p>{text('Geçerli bekleyen davet yok.', 'No valid pending invitations.')}</p>
          )}
        </section>
      )}
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {mutationError && (
        <p role="alert" className="error">
          {mutationError}
        </p>
      )}
    </section>
  );
}
