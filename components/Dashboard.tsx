import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { activityDestination, activityLabel } from '../services/activity';
import { api, errorMessage } from '../services/api';
import type { Project, Usage, Workspace } from '../types';

interface Overview {
  counts: {
    projects: number;
    documents: number;
    applications: number;
    tasks: number;
    open_tasks: number;
    review_pending: number;
    application_draft: number;
    application_review_requested: number;
    application_approved: number;
  };
  recent_activity: {
    id: string;
    workspace_id?: string;
    project_id?: string | null;
    event_type: string;
    actor_name?: string;
    detail?: Record<string, unknown>;
    created_at: string;
  }[];
  upcoming: {
    id: string;
    kind: string;
    title: string;
    at: string;
    project_id?: string;
    task_id?: string;
    call_id?: string;
    application_id?: string;
  }[];
  next_actions: { kind: string; label: string; project_id?: string; application_id?: string }[];
}

export default function Dashboard({
  workspace,
  projects,
  usage,
}: {
  workspace: Workspace;
  projects: Project[];
  usage: Usage | null;
}) {
  const { text, language } = useI18n();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const root = `/w/${workspace.id}`;
  useEffect(() => {
    const controller = new AbortController();
    setOverview(null);
    setError('');
    api<Overview>(`/workspaces/${workspace.id}/overview`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setOverview(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      });
    return () => controller.abort();
  }, [workspace.id]);
  const recentProjects = [...projects]
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    .slice(0, 4);
  return (
    <div className="stack">
      <header className="page-heading">
        <div>
          <h1>{text('Çalışma alanı özeti', 'Workspace overview')}</h1>
          <p>
            {workspace.name} · {workspace.country} · {workspace.plan.toUpperCase()}
          </p>
        </div>
        <Link className="button-link primary" to={`${root}/projects?create=true`}>
          {text('Fikirden projeye başla', 'Start from an idea')}
        </Link>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!overview && !error && (
        <p role="status">
          {text('Gerçek çalışma kayıtları yükleniyor…', 'Loading workspace records…')}
        </p>
      )}
      <section className="stats" aria-label={text('Çalışma alanı kayıtları', 'Workspace records')}>
        <Link className="panel" to={`${root}/projects`}>
          <strong>{overview?.counts.projects ?? '—'}</strong>
          <span>{text('Projeler', 'Projects')}</span>
        </Link>
        <Link className="panel" to={`${root}/applications`}>
          <strong>{overview?.counts.applications ?? '—'}</strong>
          <span>{text('Başvurular', 'Applications')}</span>
        </Link>
        <Link className="panel" to={`${root}/tasks`}>
          <strong>{overview?.counts.open_tasks ?? '—'}</strong>
          <span>{text('Açık görevler', 'Open tasks')}</span>
        </Link>
        <Link className="panel" to={`${root}/applications?state=review_requested`}>
          <strong>{overview?.counts.review_pending ?? '—'}</strong>
          <span>{text('İnceleme bekleyenler', 'Awaiting review')}</span>
        </Link>
      </section>
      <div className="section-columns">
        <section className="panel stack">
          <h2>{text('Sıradaki iş', 'Next step')}</h2>
          {projects.length === 0 ? (
            <>
              <p>
                {text(
                  'Şirketiniz olmadan da kişisel proje oluşturabilirsiniz.',
                  'You can create a personal project without a company.',
                )}
              </p>
              <Link to={`${root}/projects?create=true`}>
                {text('İlk projemi oluştur', 'Create my first project')}
              </Link>
            </>
          ) : overview?.next_actions.length ? (
            <ul>
              {overview.next_actions.map((action) => (
                <li key={`${action.kind}:${action.application_id || action.project_id}`}>
                  <Link
                    to={
                      action.application_id
                        ? `${root}/applications/${action.application_id}/${action.kind === 'review_application' ? 'review' : 'checks'}`
                        : action.project_id
                          ? `${root}/projects/${action.project_id}/${action.kind.includes('draft') ? 'draft' : 'profile'}`
                          : `${root}/projects`
                    }
                  >
                    {action.kind === 'review_application'
                      ? text('Kayıtlı başvuruyu incele', 'Review the saved application')
                      : action.kind === 'confirm_profile'
                        ? text(
                            'Güncel proje profilini onayla',
                            'Confirm the current project profile',
                          )
                        : action.kind === 'check_application'
                          ? text('Başvurunun engellerini kontrol et', 'Check application blockers')
                          : action.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <p>
                {text(
                  'Projenizi geliştirebilir veya resmî çağrıları keşfedebilirsiniz.',
                  'Continue developing a project or explore official calls.',
                )}
              </p>
              <Link to={`${root}/funding`}>{text('Fonları keşfet', 'Discover funding')}</Link>
            </>
          )}
        </section>
        <section className="panel stack">
          <h2>{text('Son çalışılan projeler', 'Recent projects')}</h2>
          {recentProjects.length ? (
            <ul className="record-list">
              {recentProjects.map((item) => (
                <li key={item.id}>
                  <Link to={`${root}/projects/${item.id}/overview`}>{item.title}</Link>
                  <small>
                    {text('Revizyon', 'Revision')} {item.revision} ·{' '}
                    {item.confirmed_revision === item.revision
                      ? text('Profil onaylı', 'Profile confirmed')
                      : text('Profil onayı gerekli', 'Profile confirmation required')}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p>{text('Henüz proje yok.', 'No projects yet.')}</p>
          )}
        </section>
        <section className="panel stack">
          <h2>{text('Yaklaşan tarihler', 'Upcoming dates')}</h2>
          {overview?.upcoming.length ? (
            <ul className="record-list">
              {overview.upcoming.map((item) => (
                <li key={`${item.kind}:${item.id}`}>
                  <Link
                    to={
                      item.kind === 'task'
                        ? `${root}/tasks?task=${item.task_id || item.id}`
                        : item.call_id
                          ? `${root}/funding/calls/${item.call_id}`
                          : `${root}/calendar`
                    }
                  >
                    {item.title}
                  </Link>
                  <time dateTime={item.at}>{new Date(item.at).toLocaleString()}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {text(
                'Kaydedilmiş yaklaşan tarih yok; örnek takvim olayı gösterilmez.',
                'No recorded upcoming dates; no sample calendar events are shown.',
              )}
            </p>
          )}
          <Link to={`${root}/calendar`}>{text('Takvimi aç', 'Open calendar')}</Link>
        </section>
        <section className="panel stack">
          <h2>{text('Kullanım hakları', 'Usage allowance')}</h2>
          {usage ? (
            <>
              <p>
                {usage.month} UTC ·{' '}
                {usage.scope === 'user'
                  ? text('Free alanlarınız genelinde', 'Across your Free workspaces')
                  : text('Ekip tarafından paylaşılır', 'Shared by your team')}
              </p>
              <p>
                {text('Hakların yenileneceği zaman (UTC)', 'Allowance renewal (UTC)')}:{' '}
                {new Date(
                  Date.UTC(Number(usage.month.slice(0, 4)), Number(usage.month.slice(5, 7)), 1),
                ).toISOString()}
              </p>
              {(usage.chat.reserved > 0 || usage.write.reserved > 0) && (
                <p>
                  {text('Devam eden işlem rezervleri', 'In-progress reservations')}:{' '}
                  {usage.chat.reserved + usage.write.reserved}
                </p>
              )}
              <dl>
                <div>
                  <dt>{text('Kalan sohbet', 'Remaining chat')}</dt>
                  <dd>
                    {usage.chat.remaining} / {usage.chat.limit}
                  </dd>
                </div>
                <div>
                  <dt>{text('Kalan yazım', 'Remaining writing')}</dt>
                  <dd>
                    {usage.write.remaining} / {usage.write.limit}
                  </dd>
                </div>
              </dl>
              <Link to={`${root}/workspace/usage`}>
                {text('Kullanım detayları', 'Usage details')}
              </Link>
            </>
          ) : (
            <p>{text('Kullanım bilgisi yükleniyor.', 'Loading usage.')}</p>
          )}
        </section>
        <section className="panel stack">
          <h2>{text('Başvuru hazırlığı', 'Application preparation')}</h2>
          <dl>
            <div>
              <dt>{text('Hazırlanıyor', 'Preparing')}</dt>
              <dd>{overview?.counts.application_draft ?? '—'}</dd>
            </div>
            <div>
              <dt>{text('İnceleme bekliyor', 'Awaiting review')}</dt>
              <dd>{overview?.counts.application_review_requested ?? '—'}</dd>
            </div>
            <div>
              <dt>{text('Onaylandı', 'Approved')}</dt>
              <dd>{overview?.counts.application_approved ?? '—'}</dd>
            </div>
          </dl>
          <p>
            {text(
              'Taslak kaydı eksik alan sayısı değildir; engeller başvurunun Kontroller bölümünde hesaplanır.',
              'Draft count is not a missing-field count; blockers are computed in each application Checks section.',
            )}
          </p>
        </section>
      </div>
      <section className="panel stack">
        <h2>{text('Son faaliyetler', 'Recent activity')}</h2>
        {overview?.recent_activity.length ? (
          <ul className="activity">
            {overview.recent_activity.map((event) => (
              <li key={event.id}>
                <span>
                  <Link to={activityDestination({ ...event, workspace_id: workspace.id })}>
                    {activityLabel(event.event_type, language)}
                  </Link>
                  {event.actor_name && <small> · {event.actor_name}</small>}
                </span>
                <time dateTime={event.created_at}>
                  {new Date(event.created_at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p>{text('Henüz kayıtlı faaliyet yok.', 'No recorded activity yet.')}</p>
        )}
      </section>
    </div>
  );
}
