import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import type { ProjectSave } from '../hooks/useProjectState';
import { useI18n } from '../i18n';
import { ApiError, api, errorMessage } from '../services/api';
import { canEditWorkspace, PROJECT_SECTIONS } from '../services/navigation';
import type { Project, Usage, Workspace } from '../types';
import ProjectFile from './ProjectFile';

const DraftScreen = lazy(() => import('./DraftScreen'));
const FundMatcher = lazy(() => import('./FundMatcher'));
const IdeaAgent = lazy(() => import('./IdeaAgent'));
const ProfileScreen = lazy(() => import('./ProfileScreen'));
const ProjectBudget = lazy(() => import('./ProjectBudget'));
const ProjectHistory = lazy(() => import('./ProjectHistory'));
const ProjectStudio = lazy(() => import('./ProjectStudio'));
const ReportEditor = lazy(() => import('./ReportEditor'));

export default function ProjectDetail({
  actorId,
  workspace,
  project,
  section,
  usage,
  onProjectChanged,
  onUsage,
  onProjectsChanged,
  aiMode = 'idea',
  reportId,
}: {
  actorId: string;
  workspace: Workspace;
  project: Project;
  section: string;
  usage: Usage | null;
  onProjectChanged: () => Promise<void>;
  onUsage: () => Promise<void>;
  onProjectsChanged: () => Promise<void>;
  aiMode?: 'idea' | 'reports';
  reportId?: string;
}) {
  const { text } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [current, setCurrent] = useState(project);
  const currentRef = useRef(project);
  const operation = useRef<AbortController | null>(null);
  const revision = useRef(project.revision);
  const [refreshError, setRefreshError] = useState('');
  const install = (value: Project) => {
    if (value.id !== currentRef.current.id || value.revision < currentRef.current.revision) return;
    currentRef.current = value;
    revision.current = value.revision;
    setCurrent(value);
  };
  useEffect(() => {
    const controller = new AbortController();
    operation.current = controller;
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (project.id !== currentRef.current.id || project.revision < currentRef.current.revision)
      return;
    currentRef.current = project;
    setCurrent(project);
    revision.current = project.revision;
  }, [project]);
  const readOnly = !canEditWorkspace(workspace.role);
  const aiActive = section === 'ai';
  const reportActive = section === 'report';
  const base = `/w/${workspace.id}/projects/${project.id}`;
  const save: ProjectSave = async (changes, expectedRevision) => {
    if (readOnly) throw new Error(text('Salt okunur erişim', 'Read-only access'));
    const active = operation.current;
    if (!active || active.signal.aborted) throw new Error('The project is no longer active');
    let value: Project;
    try {
      value = await api<Project>(`/projects/${project.id}`, {
        method: 'PATCH',
        json: { ...changes, expected_revision: expectedRevision ?? revision.current },
        signal: active.signal,
      });
    } catch (error) {
      if (!active.signal.aborted && error instanceof ApiError && error.status === 409) {
        const latest = await api<Project>(`/projects/${project.id}`, { signal: active.signal });
        if (active.signal.aborted) throw error;
        install(latest);
        await Promise.all([onProjectChanged(), onProjectsChanged()]);
      }
      throw error;
    }
    if (active.signal.aborted) return value;
    install(value);
    setRefreshError('');
    try {
      await Promise.all([onProjectChanged(), onProjectsChanged()]);
    } catch (error) {
      if (!active.signal.aborted) setRefreshError(errorMessage(error));
    }
    return value;
  };
  const reload = async () => {
    const active = operation.current;
    if (!active || active.signal.aborted) return;
    const value = await api<Project>(`/projects/${project.id}`, { signal: active.signal });
    if (active.signal.aborted) return;
    install(value);
    await Promise.all([onProjectChanged(), onProjectsChanged()]);
    setRefreshError('');
  };
  return (
    <div
      className="project-detail"
      data-view={
        reportActive ? 'editor' : aiActive ? 'ai' : section === 'overview' ? 'file' : 'facts'
      }
    >
      {!reportActive && (
        <header className="project-heading">
          <div>
            <Link className="context-back" to={`/w/${workspace.id}/projects`}>
              ← {text('Projelerim', 'My projects')}
            </Link>
            <h1>{current.title}</h1>
            <p className="page-subtitle">
              {String(
                current.profile.project?.problem ||
                  current.description ||
                  text('Bir fikir, birçok olasılık.', 'One idea. So many possibilities.'),
              ).slice(0, 180)}
            </p>
          </div>
          <Link className="quiet-button" to={`${base}/profile`}>
            {text('Kapsamı gör', 'Project scope')} ↗
          </Link>
        </header>
      )}
      {refreshError && (
        <p className="notice" role="alert">
          {text(
            'Kayıt başarıyla kaydedildi; liste yenilenemedi.',
            'The record was saved successfully; the list could not be refreshed.',
          )}{' '}
          {refreshError}{' '}
          <button
            onClick={() => void reload().catch((error) => setRefreshError(errorMessage(error)))}
          >
            {text('Yeniden yükle', 'Reload')}
          </button>
        </p>
      )}
      <div className="project-navigation-bar">
        {!reportActive && (
          <nav
            className="project-navigation"
            aria-label={text('Proje bölümleri', 'Project sections')}
          >
            <NavLink to={`${base}/overview`} className={!aiActive ? 'active' : ''}>
              {text('Proje dosyası', 'Project file')}
            </NavLink>
            <NavLink to={`${base}/ai/idea`} className={aiActive ? 'active' : ''}>
              AI <span className="ai-nav-spark">✧</span>
            </NavLink>
          </nav>
        )}
        {aiActive && (
          <nav className="ai-mode-nav" aria-label={text('AI oturumu', 'AI session')}>
            <NavLink to={`${base}/ai/idea`} className={aiMode === 'idea' ? 'active' : ''}>
              {text('Fikir', 'Idea')}
            </NavLink>
            <NavLink to={`${base}/ai/reports`} className={aiMode === 'reports' ? 'active' : ''}>
              {text('Rapor üretimi', 'Report writing')}
            </NavLink>
          </nav>
        )}
      </div>
      <div
        className={`project-content${aiActive || reportActive ? ' project-content-workspace' : ''}`}
        key={`${section}:${aiMode}:${reportId || ''}`}
      >
        {!PROJECT_SECTIONS.some((name) => name === section) && !aiActive && !reportActive ? (
          <p role="alert">{text('Bölüm bulunamadı.', 'Section not found.')}</p>
        ) : (
          <Suspense
            key={`${section}:${aiMode}:${reportId || ''}`}
            fallback={
              <p role="status">{text('Proje bölümü yükleniyor…', 'Loading project section…')}</p>
            }
          >
            {(section === 'budget' || section === 'eligibility') && workspace.plan !== 'pro' && (
              <section className="panel">
                <p>
                  {text(
                    'Yeni bütçe düzenleme ve uygunluk değerlendirmesi Pro gerektirir. Mevcut kayıtlar salt okunur olarak korunur.',
                    'New budget edits and eligibility evaluations require Pro. Existing records remain available read-only.',
                  )}
                </p>
                <Link to={`/w/${workspace.id}/workspace/usage`}>
                  {text('Plan ve kullanım bilgileri', 'Plan and usage details')}
                </Link>
              </section>
            )}
            {section === 'overview' && <ProjectFile workspace={workspace} project={current} />}
            {section === 'profile' && (
              <ProfileScreen
                project={current}
                workspace={workspace}
                save={save}
                readOnly={readOnly}
              />
            )}
            {aiActive && aiMode === 'idea' && (
              <IdeaAgent
                project={current}
                workspace={workspace}
                usage={usage}
                reload={reload}
                onUsage={onUsage}
                save={save}
                readOnly={readOnly}
              />
            )}
            {aiActive && aiMode === 'reports' && (
              <ProjectStudio
                actorId={actorId}
                workspace={workspace}
                project={current}
                mode="reports"
                reportId={params.get('report') || undefined}
                onProjectChanged={reload}
                onUsage={onUsage}
              />
            )}
            {reportActive && reportId && (
              <ReportEditor
                actorId={actorId}
                workspace={workspace}
                project={current}
                reportId={reportId}
                onProjectChanged={reload}
              />
            )}
            {section === 'draft' && (
              <DraftScreen project={current} save={save} reload={reload} readOnly={readOnly} />
            )}
            {section === 'budget' && (
              <ProjectBudget
                project={current}
                workspace={workspace}
                save={save}
                readOnly={readOnly || workspace.plan !== 'pro'}
              />
            )}
            {section === 'eligibility' && (
              <FundMatcher
                project={current}
                workspace={workspace}
                onSelectCall={(callId) =>
                  navigate(
                    `/w/${workspace.id}/applications?project=${project.id}&call=${encodeURIComponent(callId)}`,
                  )
                }
              />
            )}
            {section === 'history' && <ProjectHistory project={current} />}
          </Suspense>
        )}
      </div>
    </div>
  );
}
