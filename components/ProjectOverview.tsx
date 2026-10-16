import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { api, errorMessage } from '../services/api';
import type { Project, Workspace } from '../types';
export default function ProjectOverview({
  workspace,
  project,
}: {
  workspace: Workspace;
  project: Project;
}) {
  const { text } = useI18n();
  const [counts, setCounts] = useState<{
    documents: number;
    applications: number;
    tasks: number;
    openTasks: number;
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setCounts(null);
    setError('');
    const loadApplications = async () => {
      let count = 0;
      while (!controller.signal.aborted) {
        const rows = await api<unknown[]>(
          `/projects/${project.id}/applications?limit=500&offset=${count}`,
          { signal: controller.signal },
        );
        count += rows.length;
        if (rows.length < 500) return count;
      }
      return count;
    };
    Promise.all([
      api<unknown[]>(`/projects/${project.id}/documents`, { signal: controller.signal }),
      loadApplications(),
      api<{ status: string }[]>(`/projects/${project.id}/tasks`, { signal: controller.signal }),
    ])
      .then(([documents, applications, tasks]) => {
        if (!controller.signal.aborted)
          setCounts({
            documents: documents.length,
            applications,
            tasks: tasks.length,
            openTasks: tasks.filter((task) => !['done', 'cancelled'].includes(task.status)).length,
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorMessage(error));
      });
    return () => controller.abort();
  }, [project.id]);
  const base = `/w/${workspace.id}/projects/${project.id}`;
  return (
    <section className="stack">
      <h2>{text('Proje özeti', 'Project overview')}</h2>
      <section className="panel">
        <p>
          {project.description ||
            text('Henüz açıklama girilmedi.', 'No description has been entered yet.')}
        </p>
        <dl>
          <dt>{text('Aşama', 'Stage')}</dt>
          <dd>{project.stage}</dd>
          <dt>{text('Kayıtlı revizyon', 'Saved revision')}</dt>
          <dd>{project.revision}</dd>
          <dt>{text('Profil durumu', 'Profile status')}</dt>
          <dd>
            {project.confirmed_revision === project.revision
              ? text('Bu revizyon onaylandı', 'This revision is confirmed')
              : text('Kayıtlı profil onayı gerekli', 'Saved profile confirmation is needed')}
          </dd>
          <dt>{text('Proje bütçesi', 'Project budget')}</dt>
          <dd>
            {project.profile.budget?.items.length
              ? `${project.profile.budget.items.length} ${text('gider kalemi', 'expense items')} · ${project.profile.budget.currency}`
              : text('Girilmedi', 'Not entered')}
          </dd>
        </dl>
        <div className="actions">
          <Link to={`${base}/profile`}>{text('Profili aç', 'Open profile')}</Link>
          <Link to={`${base}/draft`}>
            {text('Ücretsiz genel taslak ve indirme', 'Free general draft and exports')}
          </Link>
          {workspace.plan === 'pro' && (
            <>
              <Link to={`${base}/budget`}>{text('Bütçeyi düzenle', 'Edit budget')}</Link>
              <Link to={`${base}/eligibility`}>{text('Çağrı uygunluğu', 'Call eligibility')}</Link>
            </>
          )}
        </div>
      </section>
      <section className="panel">
        <h3>{text('İlişkili kayıtlar', 'Related records')}</h3>
        <dl>
          <dt>
            <Link to={`/w/${workspace.id}/documents?project=${project.id}`}>
              {text('Belgeler', 'Documents')}
            </Link>
          </dt>
          <dd>{counts?.documents ?? '—'}</dd>
          <dt>
            <Link to={`/w/${workspace.id}/applications?project=${project.id}`}>
              {text('Başvurular', 'Applications')}
            </Link>
          </dt>
          <dd>{counts?.applications ?? '—'}</dd>
          <dt>
            <Link to={`/w/${workspace.id}/tasks?project=${project.id}&tab=project`}>
              {text('Görevler', 'Tasks')}
            </Link>
          </dt>
          <dd>{counts ? `${counts.openTasks} ${text('açık', 'open')} / ${counts.tasks}` : '—'}</dd>
        </dl>
        {!counts && !error && (
          <p role="status">{text('Kayıt sayıları yükleniyor…', 'Loading record counts…')}</p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
    </section>
  );
}
