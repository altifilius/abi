import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { api, errorMessage } from '../services/api';
import type { Project, Usage, Workspace } from '../types';

interface Event {
  id: string;
  event_type: string;
  created_at: string;
  project_id?: string;
}
export default function Dashboard({
  project,
  projects,
  workspace,
  usage,
  onNavigate,
}: {
  project: Project | null;
  projects: Project[];
  workspace: Workspace;
  usage: Usage | null;
  onNavigate: (tab: string) => void;
}) {
  const { text } = useI18n();
  const [activity, setActivity] = useState<Event[]>([]);
  const [counts, setCounts] = useState<{
    documents: number;
    applications: number;
    tasks: number;
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const active = new AbortController();
    setActivity([]);
    setCounts(null);
    setError('');
    api<Event[]>(`/workspaces/${workspace.id}/activity`, { signal: active.signal })
      .then((value) => {
        if (!active.signal.aborted) setActivity(value);
      })
      .catch((error) => {
        if (!active.signal.aborted) setError(errorMessage(error));
      });
    if (project) {
      const paths =
        workspace.plan === 'pro' ? ['documents', 'applications', 'tasks'] : ['documents'];
      Promise.all(
        paths.map((path) =>
          api<unknown[]>(`/projects/${project.id}/${path}`, { signal: active.signal }),
        ),
      )
        .then((values) => {
          if (!active.signal.aborted)
            setCounts({
              documents: values[0]?.length || 0,
              applications: values[1]?.length || 0,
              tasks: values[2]?.length || 0,
            });
        })
        .catch((error) => {
          if (!active.signal.aborted) setError(errorMessage(error));
        });
    }
    return () => active.abort();
  }, [workspace.id, workspace.plan, project]);
  return (
    <div className="stack">
      <h1>{text('Çalışma alanı özeti', 'Workspace overview')}</h1>
      <p>
        {workspace.name} · {workspace.country} · {workspace.plan.toUpperCase()} · {workspace.role}
      </p>
      <div className="stats">
        <section className="panel">
          <strong>{projects.length}</strong>
          <span>{text('Proje', 'Projects')}</span>
        </section>
        <section className="panel">
          <strong>{counts?.documents ?? '—'}</strong>
          <span>{text('Seçili proje belgeleri', 'Selected project documents')}</span>
        </section>
        <section className="panel">
          <strong>{workspace.plan === 'pro' ? (counts?.applications ?? '—') : 'Pro'}</strong>
          <span>{text('Başvurular', 'Applications')}</span>
        </section>
        <section className="panel">
          <strong>{workspace.plan === 'pro' ? (counts?.tasks ?? '—') : 'Pro'}</strong>
          <span>{text('Görevler', 'Tasks')}</span>
        </section>
      </div>
      {usage && (
        <section className="panel">
          <h2>
            {usage.scope === 'user'
              ? text(
                  'Kullanıcı genelinde aylık krediler',
                  'Monthly credits across all your Free workspaces',
                )
              : text('Paylaşılan aylık krediler', 'Shared monthly credits')}{' '}
            · {usage.month} UTC
          </h2>
          <p>
            {text('Sohbet kullanımı', 'Chat usage')}: {usage.chat.used} / {usage.chat.limit} ·{' '}
            {text('Kalan', 'Remaining')}: {usage.chat.remaining}
          </p>
          <p>
            {text('Yazım kullanımı', 'Writing usage')}: {usage.write.used} / {usage.write.limit} ·{' '}
            {text('Kalan', 'Remaining')}: {usage.write.remaining}
          </p>
          <p>
            {text(
              'Pro en fazla 3 üye (sahip dahil). Otomatik aşım veya etkin ödeme yok.',
              'Pro supports up to 3 members including the owner. No automatic overage or active billing.',
            )}
          </p>
        </section>
      )}
      <section className="panel">
        <h2>{text('Sıradaki adım', 'Next step')}</h2>
        <div className="actions">
          <button onClick={() => onNavigate('projects')}>
            {text('Proje oluştur / seç', 'Create / select project')}
          </button>
          <button disabled={!project} onClick={() => onNavigate('profile')}>
            {text('Profili düzenle ve onayla', 'Edit and confirm profile')}
          </button>
          <button disabled={!project} onClick={() => onNavigate('draft')}>
            {text('Ücretsiz taslak indir', 'Download free draft')}
          </button>
          <button onClick={() => onNavigate('funding')}>
            {text('Resmî fonları keşfet', 'Discover official funding')}
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>{text('Gerçek etkinlik geçmişi', 'Actual activity history')}</h2>
        {activity.length === 0 && (
          <p>{text('Henüz kayıtlı etkinlik yok.', 'No recorded activity yet.')}</p>
        )}
        <ul className="activity">
          {activity.map((event) => (
            <li key={event.id}>
              <span>{event.event_type}</span>
              <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time>
            </li>
          ))}
        </ul>
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
