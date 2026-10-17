import { ArrowRight, Ellipsis, FolderOpen, Plus, Search, Sparkles, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState('');
  const query = params.get('q') || '';
  const canEdit = canEditWorkspace(workspace.role);
  const canDelete = workspace.role === 'admin' || workspace.role === 'owner';
  const base = `/w/${workspace.id}/projects`;
  const visible = projects.filter((project) =>
    `${project.title} ${project.description}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const createProject = async () => {
    if (creatingRef.current || !canEdit) return;
    creatingRef.current = true;
    setCreating(true);
    setError('');
    let created: Project | null = null;
    try {
      created = await api<Project>(`/workspaces/${workspace.id}/projects`, {
        method: 'POST',
        json: { title: text('Yeni fikrim', 'My new idea') },
      });
      navigate(`${base}/${created.id}/ai/idea`);
      await onChanged();
    } catch (reason) {
      if (created) navigate(`${base}/${created.id}/ai/idea`);
      else setError(errorMessage(reason));
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };
  return (
    <div className="projects-screen page-enter">
      <header className="projects-heading">
        <div>
          <p className="eyebrow">{text('FİKRİNE YER AÇ', 'MAKE ROOM FOR YOUR IDEAS')}</p>
          <h1>
            {text('Projelerim', 'My projects')}
            <span className="heading-dot">.</span>
          </h1>
          <p className="page-subtitle">
            {text(
              'Düşündüğün yerden, bir sonraki adıma.',
              'From where you left off to what comes next.',
            )}
          </p>
        </div>
        {canEdit && (
          <button className="primary" disabled={creating} onClick={() => void createProject()}>
            <Plus size={18} />
            {creating ? text('Açılıyor…', 'Opening…') : text('Yeni proje', 'New project')}
          </button>
        )}
      </header>
      <div className="project-search-wrap">
        <Search size={19} aria-hidden="true" />
        <label className="sr-only" htmlFor="project-search">
          {text('Projelerinde ara', 'Search your projects')}
        </label>
        <input
          id="project-search"
          type="search"
          value={query}
          placeholder={text('Projelerinde ara…', 'Search your projects…')}
          onChange={(event) => {
            const next = new URLSearchParams(params);
            if (event.target.value) next.set('q', event.target.value);
            else next.delete('q');
            setParams(next, { replace: true });
          }}
        />
        {query && (
          <button
            className="icon-button"
            aria-label={text('Aramayı temizle', 'Clear search')}
            onClick={() => setParams({})}
          >
            <X size={16} />
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!canEdit && (
        <p className="quiet-notice">
          {text(
            'Bu alanda kayıtlı projeleri görüntüleyebilirsin.',
            'You have read-only access to the saved projects in this workspace.',
          )}
        </p>
      )}
      {visible.length ? (
        <ul className="project-grid">
          {visible.map((project, index) => {
            const confirmed = project.confirmed_revision === project.revision;
            const started =
              !!project.description || Object.keys(project.profile.project || {}).length > 0;
            const summary = String(
              project.profile.project?.problem ||
                project.description ||
                text(
                  'Her proje bir konuşmayla başlar. Fikrini birlikte netleştirelim.',
                  'Every project starts with a conversation. Let’s give your idea a little clarity.',
                ),
            );
            return (
              <li
                className="project-card"
                key={project.id}
                style={{ '--project-color': `var(--project-${index % 5})` } as CSSProperties}
              >
                <Link className="project-card-main" to={`${base}/${project.id}/overview`}>
                  <span className="project-card-top">
                    <span className="project-symbol" aria-hidden="true">
                      {project.title.trim().slice(0, 1).toLocaleUpperCase()}
                    </span>
                    <span className="project-updated">
                      {project.updated_at
                        ? new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-GB', {
                            day: 'numeric',
                            month: 'short',
                          }).format(new Date(project.updated_at))
                        : ''}
                    </span>
                  </span>
                  <h2>{project.title}</h2>
                  <p className="project-summary">{summary}</p>
                  <span className="project-next">
                    <span>
                      {confirmed
                        ? text('Raporlarını geliştirmeye devam et', 'Keep shaping your reports')
                        : started
                          ? text('Proje kapsamını netleştir', 'Refine your project scope')
                          : text('Fikir sohbetine devam et', 'Continue the idea conversation')}
                    </span>
                    <ArrowRight size={18} />
                  </span>
                </Link>
                {canDelete && (
                  <details className="project-options">
                    <summary
                      aria-label={`${project.title} · ${text('Proje seçenekleri', 'Project options')}`}
                    >
                      <Ellipsis size={19} />
                    </summary>
                    <button
                      onClick={() => {
                        setDeleting(project);
                        setConfirmation('');
                        setError('');
                      }}
                    >
                      {text('Projeyi sil', 'Delete project')}
                    </button>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="project-empty">
          <span className="empty-illustration">
            {query ? <Search size={34} /> : <FolderOpen size={38} strokeWidth={1.2} />}
          </span>
          <h2>
            {query
              ? text('Bu aramada proje yok', 'No projects match this search')
              : text('İlk fikrine bir yer açalım', 'Make a home for your first idea')}
          </h2>
          <p>
            {query
              ? text('Başka bir ad veya kelime dene.', 'Try another name or keyword.')
              : text(
                  'Uzun formlar yok. Aklındakini anlat; kapsamını, raporlarını ve uygun destekleri birlikte geliştirelim.',
                  'No long forms. Tell us what’s on your mind; we’ll shape the project, reports and relevant support together.',
                )}
          </p>
          {!query && canEdit && (
            <button className="primary" disabled={creating} onClick={() => void createProject()}>
              <Sparkles size={17} />
              {text('Fikrimi anlat', 'Start with my idea')}
            </button>
          )}
        </section>
      )}
      {deleting && (
        <div className="modal-backdrop">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
            className="confirmation-dialog"
          >
            <h2 id="delete-project-title">
              {text('Bu projeyi silmek istiyor musun?', 'Delete this project?')}
            </h2>
            <p>
              {text(
                'Proje ve bağlı kayıtlar kalıcı olarak silinir. Onaylamak için proje adını yaz.',
                'The project and its records will be permanently removed. Type the project name to confirm.',
              )}
            </p>
            <p>
              <strong>{deleting.title}</strong>
            </p>
            <label>
              {text('Proje adı', 'Project name')}
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <div className="actions">
              <button disabled={deleteBusy} onClick={() => setDeleting(null)}>
                {text('Vazgeç', 'Cancel')}
              </button>
              <button
                className="danger"
                disabled={deleteBusy || confirmation !== deleting.title}
                onClick={async () => {
                  setDeleteBusy(true);
                  try {
                    await api(`/projects/${deleting.id}`, { method: 'DELETE' });
                    setDeleting(null);
                    await onChanged();
                  } catch (reason) {
                    setError(errorMessage(reason));
                  } finally {
                    setDeleteBusy(false);
                  }
                }}
              >
                {text('Kalıcı olarak sil', 'Delete permanently')}
              </button>
            </div>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
