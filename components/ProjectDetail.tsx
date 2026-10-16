import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { ProjectSave } from '../hooks/useProjectState';
import { useI18n } from '../i18n';
import { ApiError, api, errorMessage } from '../services/api';
import { canEditWorkspace, PROJECT_SECTIONS } from '../services/navigation';
import type { Project, Usage, Workspace } from '../types';
import ProjectOverview from './ProjectOverview';

const DraftScreen = lazy(() => import('./DraftScreen'));
const FundMatcher = lazy(() => import('./FundMatcher'));
const IdeaAgent = lazy(() => import('./IdeaAgent'));
const ProfileScreen = lazy(() => import('./ProfileScreen'));
const ProjectBudget = lazy(() => import('./ProjectBudget'));
const ProjectHistory = lazy(() => import('./ProjectHistory'));

export default function ProjectDetail({
  workspace,
  project,
  section,
  usage,
  onProjectChanged,
  onUsage,
  onProjectsChanged,
}: {
  workspace: Workspace;
  project: Project;
  section: string;
  usage: Usage | null;
  onProjectChanged: () => Promise<void>;
  onUsage: () => Promise<void>;
  onProjectsChanged: () => Promise<void>;
}) {
  const { text } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
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
  const labels: Record<string, [string, string]> = {
    overview: ['Özet', 'Overview'],
    profile: ['Profil', 'Profile'],
    conversation: ['Sohbet', 'Conversation'],
    draft: ['Genel taslak', 'General draft'],
    budget: ['Bütçe · Pro', 'Budget · Pro'],
    eligibility: ['Uygunluk · Pro', 'Eligibility · Pro'],
    history: ['Geçmiş', 'History'],
  };
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
    <div className="stack">
      <header>
        <Link to={`/w/${workspace.id}/projects`}>{text('Tüm projeler', 'All projects')}</Link>
        <h1>{current.title}</h1>
      </header>
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
      <nav className="section-nav" aria-label={text('Proje bölümleri', 'Project sections')}>
        {PROJECT_SECTIONS.map((name) => (
          <NavLink
            key={name}
            to={`${base}/${name}${location.search}`}
            className={({ isActive }) => (isActive ? 'active' : undefined)}
          >
            {text(...labels[name])}
          </NavLink>
        ))}
      </nav>
      {!PROJECT_SECTIONS.some((name) => name === section) ? (
        <p role="alert">{text('Bölüm bulunamadı.', 'Section not found.')}</p>
      ) : (
        <Suspense
          key={section}
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
          {section === 'overview' && <ProjectOverview workspace={workspace} project={current} />}
          {section === 'profile' && (
            <ProfileScreen
              project={current}
              workspace={workspace}
              save={save}
              readOnly={readOnly}
            />
          )}
          {section === 'conversation' && (
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
  );
}
