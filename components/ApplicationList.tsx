import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { api, errorMessage } from '../services/api';
import { canEditWorkspace } from '../services/navigation';
import type { Project, Workspace } from '../types';
import type { ApplicationCall, ApplicationRecord } from './applicationData';

export default function ApplicationList({
  workspace,
  projects,
}: {
  workspace: Workspace;
  projects: Project[];
}) {
  const { text } = useI18n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [call, setCall] = useState<ApplicationCall | null>(null);
  const [creationProject, setCreationProject] = useState<Project | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<{ user_id: string; name: string; role: string }[]>([]);
  const [error, setError] = useState('');
  const listRequest = useRef<AbortController | null>(null);
  const creationScope = useRef<{
    workspaceId: string;
    projectId: string;
    callId: string;
    controller: AbortController;
  } | null>(null);
  const callId = params.get('call') || '';
  const projectId = params.get('project') || '';
  const state = params.get('state') || '';
  const dueBefore = params.get('due') || '';
  const responsibleId = params.get('responsible') || '';
  const query = params.get('q') || '';
  const requestedOffset = Number(params.get('offset'));
  const offset = Number.isSafeInteger(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;
  const base = `/w/${workspace.id}`;
  const canCreate = workspace.plan === 'pro' && canEditWorkspace(workspace.role);

  const load = useCallback(async () => {
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setLoading(true);
    setApplications([]);
    setError('');
    const filters = new URLSearchParams({ limit: '100', offset: String(offset) });
    if (projectId) filters.set('project_id', projectId);
    if (state) filters.set('state', state);
    if (query) filters.set('q', query);
    if (dueBefore) filters.set('due_before', dueBefore);
    if (responsibleId) filters.set('responsible_id', responsibleId);
    try {
      const value = await api<ApplicationRecord[]>(
        `/workspaces/${workspace.id}/applications?${filters}`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) setApplications(value);
    } catch (reason) {
      if (!controller.signal.aborted) setError(errorMessage(reason));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [workspace.id, projectId, state, query, offset, dueBefore, responsibleId]);

  useEffect(() => {
    void load();
    return () => listRequest.current?.abort();
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    api<{ user_id: string; name: string; role: string }[]>(`/workspaces/${workspace.id}/members`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setMembers(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      });
    return () => controller.abort();
  }, [workspace.id]);

  useEffect(() => {
    const active = {
      workspaceId: workspace.id,
      projectId,
      callId,
      controller: new AbortController(),
    };
    creationScope.current = active;
    setBusy(false);
    return () => active.controller.abort();
  }, [workspace.id, projectId, callId]);

  useEffect(() => {
    const controller = new AbortController();
    setCall(null);
    if (callId)
      api<ApplicationCall>(`/calls/${encodeURIComponent(callId)}`, { signal: controller.signal })
        .then((value) => {
          if (!controller.signal.aborted) setCall(value);
        })
        .catch((reason) => {
          if (!controller.signal.aborted) setError(errorMessage(reason));
        });
    return () => controller.abort();
  }, [callId]);

  useEffect(() => {
    const controller = new AbortController();
    setCreationProject(null);
    setReviewed(false);
    if (
      callId &&
      projects.some((project) => project.id === projectId && project.workspace_id === workspace.id)
    ) {
      api<Project>(`/projects/${projectId}`, { signal: controller.signal })
        .then((value) => {
          if (!controller.signal.aborted && value.workspace_id === workspace.id)
            setCreationProject(value);
        })
        .catch((reason) => {
          if (!controller.signal.aborted) setError(errorMessage(reason));
        });
    }
    return () => controller.abort();
  }, [callId, projectId, workspace.id, projects]);

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (key !== 'offset') next.delete('offset');
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const confirmed =
    !!creationProject &&
    creationProject.id === projectId &&
    creationProject.workspace_id === workspace.id &&
    creationProject.confirmed_revision === creationProject.revision;
  const available =
    !!call &&
    call.id === callId &&
    call.status === 'published' &&
    (!call.deadline || Date.parse(call.deadline) > Date.now()) &&
    (!call.opens_at || Date.parse(call.opens_at) <= Date.now());
  const visible = [...applications].sort((a, b) =>
    (a.deadline || '9999').localeCompare(b.deadline || '9999'),
  );

  const create = async () => {
    if (!canCreate || !creationProject || !confirmed || !reviewed || !available || busy) return;
    const active = creationScope.current;
    if (
      active?.workspaceId !== workspace.id ||
      active.projectId !== projectId ||
      active.callId !== callId ||
      active.controller.signal.aborted
    )
      return;
    const signal = active.controller.signal;
    setBusy(true);
    setError('');
    try {
      // Recheck the reviewed revision immediately before creating; never silently substitute a changed profile.
      const latest = await api<Project>(`/projects/${creationProject.id}`, { signal });
      if (signal.aborted) return;
      if (
        latest.workspace_id !== workspace.id ||
        latest.revision !== creationProject.revision ||
        latest.confirmed_revision !== latest.revision
      ) {
        setCreationProject(latest.workspace_id === workspace.id ? latest : null);
        setReviewed(false);
        setError(
          text(
            'Proje değişti. Güncel profili tekrar inceleyin ve onaylayın.',
            'The project changed. Review and confirm the current profile again.',
          ),
        );
        return;
      }
      const value = await api<ApplicationRecord>(`/projects/${latest.id}/applications`, {
        method: 'POST',
        signal,
        json: { call_id: callId, expected_profile_revision: latest.revision },
      });
      if (signal.aborted) return;
      if (value.project_id !== latest.id || value.call_id !== callId)
        throw new Error(
          text(
            'Sunucu farklı bir başvuru döndürdü.',
            'The server returned a different application.',
          ),
        );
      navigate(`${base}/applications/${value.id}/text`);
    } catch (reason) {
      if (!signal.aborted) setError(errorMessage(reason));
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  };

  return (
    <div className="stack">
      <header>
        <h1>{text('Başvurular', 'Applications')}</h1>
        <p>
          {text(
            'Çağrıya bağlı kayıtlı paketler; resmî portala otomatik gönderim yapılmaz.',
            'Saved call-specific preparation packages; there is no automatic official portal submission.',
          )}
        </p>
      </header>
      {workspace.plan !== 'pro' && (
        <p className="notice">
          {text(
            'Geçmiş başvuruları okuyabilirsiniz. Oluşturma, düzenleme, kontrol, onay ve nihai paket indirme Pro gerektirir.',
            'Historical applications remain readable. Creating, editing, checking, approving and exporting final packages require Pro.',
          )}
        </p>
      )}
      {!canEditWorkspace(workspace.role) && (
        <p>{text('Görüntüleyici erişimi: salt okunur.', 'Viewer access: read-only.')}</p>
      )}
      <section className="panel">
        <div className="actions">
          <Link to={`${base}/funding`}>
            {text('Çağrı keşfet ve başvuru hazırla', 'Discover a call and prepare an application')}
          </Link>
          <button disabled={loading || busy} onClick={() => void load()}>
            {text('Listeyi yenile', 'Reload list')}
          </button>
        </div>
        <div className="form-grid">
          <label>
            {text('Ara', 'Search')}
            <input
              value={query}
              maxLength={200}
              onChange={(event) => updateFilter('q', event.target.value)}
            />
          </label>
          <label>
            {text('Proje', 'Project')}
            <select
              value={projectId}
              disabled={busy}
              onChange={(event) => updateFilter('project', event.target.value)}
            >
              <option value="">{text('Tüm projeler', 'All projects')}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            {text('Durum', 'State')}
            <select value={state} onChange={(event) => updateFilter('state', event.target.value)}>
              <option value="">{text('Tüm durumlar', 'All states')}</option>
              {['draft', 'review_requested', 'approved'].map((value) => (
                <option key={value} value={value}>
                  {value === 'draft'
                    ? text('Taslak', 'Draft')
                    : value === 'review_requested'
                      ? text('İnceleme bekliyor', 'Awaiting review')
                      : text('Onaylandı', 'Approved')}
                </option>
              ))}
            </select>
          </label>
          <label>
            {text('Son tarih en geç (UTC)', 'Deadline on or before (UTC)')}
            <input
              type="date"
              value={dueBefore}
              onChange={(event) => updateFilter('due', event.target.value)}
            />
          </label>
          <label>
            {text('Sorumlu', 'Responsible member')}
            <select
              value={responsibleId}
              onChange={(event) => updateFilter('responsible', event.target.value)}
            >
              <option value="">{text('Tüm sorumlular', 'All responsible members')}</option>
              {members
                .filter((member) => member.role !== 'viewer')
                .map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </section>
      {callId && (
        <section className="panel">
          <h2>
            {text('Başvuru oluştur', 'Create application')} ·{' '}
            {call?.title || text('Çağrı yükleniyor', 'Loading call')}
          </h2>
          {call && (
            <p>
              {text('Çağrı sürümü', 'Call version')} {call.version} · {call.status} ·{' '}
              {text('Dil', 'Language')}: {call.language} ·{' '}
              {text('Son tarih (UTC)', 'Deadline (UTC)')}:{' '}
              {call.deadline ? new Date(call.deadline).toISOString() : '—'}
            </p>
          )}
          {!projectId && (
            <p>
              {text(
                'Yukarıdan gerçek bir proje seçin; otomatik proje oluşturulmaz.',
                'Choose an actual project above; no placeholder project is created.',
              )}
            </p>
          )}
          {creationProject && (
            <>
              <h3>{creationProject.title}</h3>
              <p>{creationProject.description}</p>
              <p>
                {text('Profil revizyonu', 'Profile revision')}: {creationProject.revision} ·{' '}
                {confirmed ? text('Onaylı', 'Confirmed') : text('Onay bekliyor', 'Unconfirmed')}
              </p>
              <Link to={`${base}/projects/${creationProject.id}/profile`}>
                {text('Profili incele / onayla', 'Review / confirm profile')}
              </Link>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={reviewed}
                  disabled={!canCreate || !confirmed || busy}
                  onChange={(event) => setReviewed(event.target.checked)}
                />
                {text(
                  'Bu çağrıyı ve seçili onaylı proje profilini inceledim. Oluşturulan alanları ayrıca inceleyeceğim.',
                  'I reviewed this call and the selected confirmed project profile. I will also review the generated fields.',
                )}
              </label>
            </>
          )}
          {creationProject && (
            <details>
              <summary>
                {text(
                  'Başvuruya aktarılacak onaylı profil ve bütçe',
                  'Confirmed profile and budget used for creation',
                )}
              </summary>
              <pre>{JSON.stringify(creationProject.profile, null, 2)}</pre>
            </details>
          )}
          {call && !available && (
            <p className="error">
              {text(
                'Yalnızca yayımlanmış ve şu anda açık çağrıyla yeni başvuru oluşturulabilir.',
                'New applications require a published call that is currently open.',
              )}
            </p>
          )}
          <button
            disabled={!canCreate || !confirmed || !reviewed || !available || busy}
            onClick={() => void create()}
          >
            {text('Seçili proje ve çağrıdan oluştur', 'Create from selected project and call')}
          </button>
        </section>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">{text('Başvurular yükleniyor…', 'Loading applications…')}</p>
      ) : (
        <section className="panel">
          <p>
            {text('Sayfa', 'Page')} {Math.floor(offset / 100) + 1} ·{' '}
            {text('Yüklenen kayıt', 'Loaded records')}: {applications.length}
          </p>
          {!visible.length && (
            <p>
              {text(
                'Bu filtrelerde kayıtlı başvuru yok.',
                'No saved applications match these filters.',
              )}
            </p>
          )}
          <ul className="record-list">
            {visible.map((item) => (
              <li key={item.id}>
                <Link to={`${base}/applications/${item.id}/overview`}>
                  {item.call_title || text('Çağrı başlığı bulunamadı', 'Call title unavailable')}
                </Link>
                <p>
                  {item.project_title ||
                    projects.find((project) => project.id === item.project_id)?.title ||
                    text('Proje başlığı bulunamadı', 'Project title unavailable')}{' '}
                  · {item.program_name} · {item.state} · r{item.revision}
                </p>
                <p>
                  {text('Sorumlu', 'Responsible member')}:{' '}
                  {item.responsible_name || text('Atanmamış', 'Unassigned')}
                </p>
                <p>
                  {text('Son tarih (UTC)', 'Deadline (UTC)')}:{' '}
                  {item.deadline
                    ? new Date(item.deadline).toISOString()
                    : text('Kaynakta belirtilmemiş', 'Not specified by the source')}
                </p>
              </li>
            ))}
          </ul>
          <div className="actions">
            {offset > 0 && (
              <button
                disabled={busy}
                onClick={() => updateFilter('offset', String(Math.max(0, offset - 100)))}
              >
                {text('Önceki sayfa', 'Previous page')}
              </button>
            )}
            {applications.length === 100 && (
              <button disabled={busy} onClick={() => updateFilter('offset', String(offset + 100))}>
                {text('Sonraki sayfa', 'Next page')}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
