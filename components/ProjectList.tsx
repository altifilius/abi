import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useUnsavedChanges } from '../contexts/NavigationGuard';
import { useI18n } from '../i18n';
import { api, errorMessage } from '../services/api';
import { canEditWorkspace } from '../services/navigation';
import type { Project, Workspace } from '../types';
export default function ProjectList({
  workspace,
  projects,
  onChanged,
}: {
  workspace: Workspace;
  projects: Project[];
  onChanged: () => Promise<void>;
}) {
  const { text, language } = useI18n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const [title, setTitle] = useState('');
  const [created, setCreated] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canEdit = canEditWorkspace(workspace.role);
  const canDelete = workspace.role === 'admin' || workspace.role === 'owner';
  useUnsavedChanges(!!title.trim(), () => setTitle(''));
  const visible = projects.filter((project) =>
    `${project.title} ${project.description}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="stack">
      <h1>{text('Projeler', 'Projects')}</h1>
      <label>
        {text('Projelerde ara', 'Search projects')}
        <input
          type="search"
          value={query}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.value) next.set('q', e.target.value);
            else next.delete('q');
            setParams(next, { replace: true });
          }}
        />
      </label>
      {canEdit && (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || !title.trim()) return;
            setBusy(true);
            setError('');
            try {
              const project = await api<Project>(`/workspaces/${workspace.id}/projects`, {
                method: 'POST',
                json: { title: title.trim() },
              });
              setTitle('');
              setCreated(project);
              await onChanged();
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>{text('Yeni proje', 'New project')}</h2>
          <p>
            {text(
              'Şirket kurmadan kişisel proje oluşturabilirsiniz. Proje adı ve bilgileri profil bölümünden düzenlenir.',
              'You can create a personal project without incorporating a company. Rename and edit facts in its profile section.',
            )}
          </p>
          <label>
            {text('Proje adı', 'Project name')}
            <input
              required
              maxLength={200}
              value={title}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy || !title.trim()}>
            {text('Proje oluştur', 'Create project')}
          </button>
        </form>
      )}
      {created && (
        <p role="status">
          {text('Proje oluşturuldu', 'Project created')}:{' '}
          <Link to={`/w/${workspace.id}/projects/${created.id}/overview`}>{created.title}</Link>
        </p>
      )}
      {!canEdit && (
        <p className="notice">
          {text(
            'Salt okunur: projeleri açabilir ve kayıtlı içerikleri görüntüleyebilirsiniz.',
            'Read-only: open projects and view their saved content.',
          )}
        </p>
      )}
      <section className="panel">
        <h2>{text('Proje listesi', 'Project list')}</h2>
        {visible.length === 0 && (
          <p>
            {query
              ? text('Aramayla eşleşen proje yok.', 'No projects match the search.')
              : text('Henüz proje yok.', 'No projects yet.')}
          </p>
        )}
        <ul className="stack">
          {visible.map((project) => (
            <li key={project.id}>
              <div>
                <Link to={`/w/${workspace.id}/projects/${project.id}/overview`}>
                  <strong>{project.title}</strong>
                </Link>
                <p>{project.description.slice(0, 200)}</p>
                <small>
                  {text('Revizyon', 'Revision')} {project.revision} ·{' '}
                  {project.confirmed_revision === project.revision
                    ? text('Profil onaylı', 'Profile confirmed')
                    : text('Profil onayı gerekli', 'Profile confirmation needed')}
                  {project.updated_at
                    ? ` · ${new Date(project.updated_at).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-GB', { timeZone: 'UTC' })} UTC`
                    : ''}
                </small>
              </div>
              <div className="actions">
                <button
                  onClick={() => navigate(`/w/${workspace.id}/projects/${project.id}/overview`)}
                >
                  {text('Aç', 'Open')}
                </button>
                {canEdit && (
                  <Link to={`/w/${workspace.id}/projects/${project.id}/profile`}>
                    {text('Adı ve profili düzenle', 'Rename and edit profile')}
                  </Link>
                )}
                {canDelete && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      setDeleting(project);
                      setConfirmation('');
                    }}
                  >
                    {text('Sil', 'Delete')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
      {deleting && canDelete && (
        <section
          className="panel"
          role="alertdialog"
          aria-label={text('Proje silme onayı', 'Confirm project deletion')}
        >
          <h2>
            {text('Projeyi kalıcı sil', 'Permanently delete project')}: {deleting.title}
          </h2>
          <p>
            {text(
              'Proje ve ilişkili kayıtlar geri alınamaz. Onaylamak için proje adını yazın.',
              'The project and associated records cannot be restored. Type the project title to confirm.',
            )}
          </p>
          <label>
            {text('Proje adı', 'Project title')}
            <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
          </label>
          <div className="actions">
            <button
              className="danger"
              disabled={busy || confirmation !== deleting.title}
              onClick={async () => {
                if (confirmation !== deleting.title || busy) return;
                setBusy(true);
                setError('');
                try {
                  await api(`/projects/${deleting.id}`, { method: 'DELETE' });
                  setDeleting(null);
                  setConfirmation('');
                  await onChanged();
                } catch (error) {
                  setError(errorMessage(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {text('Kalıcı olarak sil', 'Delete permanently')}
            </button>
            <button disabled={busy} onClick={() => setDeleting(null)}>
              {text('İptal', 'Cancel')}
            </button>
          </div>
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
