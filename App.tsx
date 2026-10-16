import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import AccountControls from './components/AccountControls';
import ApplicationScreen from './components/ApplicationScreen';
import Auth from './components/Auth';
import CollaborationPanel from './components/CollaborationPanel';
import Dashboard from './components/Dashboard';
import DocumentManager from './components/DocumentManager';
import DraftScreen from './components/DraftScreen';
import FundingCatalog from './components/FundingCatalog';
import FundMatcher from './components/FundMatcher';
import Help from './components/Help';
import IdeaAgent from './components/IdeaAgent';
import IncorporationGuide from './components/IncorporationGuide';
import Layout from './components/Layout';
import ProfileScreen from './components/ProfileScreen';
import ProjectScreen from './components/ProjectScreen';
import Settings from './components/Settings';
import SourceAdmin from './components/SourceAdmin';
import { useProjectState } from './hooks/useProjectState';
import { useI18n } from './i18n';
import { ApiError, api, clearSession, errorMessage, getCsrf } from './services/api';
import { loadPreferences, savePreferences } from './services/persistence';
import type { Project, Session, Usage, Workspace } from './types';
export default function App() {
  const { text } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workspaceId, setWorkspaceId] = useState(loadPreferences().workspaceId || '');
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [tab, setTab] = useState(loadPreferences().tab || 'dashboard');
  const [selectedCall, setSelectedCall] = useState('');
  const [linkStatus, setLinkStatus] = useState('');
  const workspace = session?.workspaces.find((value) => value.id === workspaceId) || null;
  const userId = session?.user.id;
  const state = useProjectState(projectId);
  const activeWorkspace = useRef<AbortController | null>(null);
  useEffect(() => {
    document.documentElement.dataset.theme = loadPreferences().theme || 'light';
    const active = new AbortController();
    getCsrf(active.signal)
      .then((value) => {
        if (!active.signal.aborted) setSession(value);
      })
      .catch((error) => {
        if (!active.signal.aborted && (!(error instanceof ApiError) || error.status !== 401))
          setError(errorMessage(error));
      })
      .finally(() => {
        if (!active.signal.aborted) setLoading(false);
      });
    return () => active.abort();
  }, []);
  useEffect(() => {
    if (!session) return;
    if (!session.workspaces.some((item) => item.id === workspaceId))
      setWorkspaceId(session.workspaces[0]?.id || '');
  }, [session, workspaceId]);
  useEffect(() => {
    setProjectId('');
    setProjects([]);
    setUsage(null);
    setSelectedCall('');
    setError('');
    if (!workspaceId || !userId) return;
    const active = new AbortController();
    activeWorkspace.current = active;
    savePreferences({ workspaceId });
    api<Project[]>(`/workspaces/${workspaceId}/projects`, { signal: active.signal })
      .then((items) => {
        if (!active.signal.aborted) {
          setProjects(items);
          const remembered = loadPreferences().projectId;
          setProjectId(
            items.some((item) => item.id === remembered) ? remembered! : items[0]?.id || '',
          );
        }
      })
      .catch((error) => {
        if (!active.signal.aborted) setError(errorMessage(error));
      });
    api<Usage>(`/workspaces/${workspaceId}/usage`, { signal: active.signal })
      .then((value) => {
        if (!active.signal.aborted) setUsage(value);
      })
      .catch((error) => {
        if (!active.signal.aborted) setError(errorMessage(error));
      });
    return () => active.abort();
  }, [workspaceId, userId]);
  useEffect(() => {
    if (projectId) savePreferences({ projectId });
    setSelectedCall('');
  }, [projectId]);
  const refreshUsage = useCallback(() => {
    const active = activeWorkspace.current;
    if (!workspaceId || !active || active.signal.aborted) return;
    api<Usage>(`/workspaces/${workspaceId}/usage`, { signal: active.signal })
      .then((value) => {
        if (!active.signal.aborted) setUsage(value);
      })
      .catch((error) => {
        if (!active.signal.aborted) setError(errorMessage(error));
      });
  }, [workspaceId]);
  const refreshWorkspaces = async () => {
    const values = await api<Workspace[]>('/workspaces');
    setSession((current) => (current ? { ...current, workspaces: values } : null));
    refreshUsage();
  };
  const navigate = (value: string) => {
    setTab(value);
    savePreferences({ tab: value });
  };
  const project =
    state.project?.workspace_id === workspaceId && state.project.id === projectId
      ? state.project
      : null;
  useEffect(() => {
    if (!userId) return;
    const params = new URLSearchParams(window.location.search);
    const verification = params.get('verify_email_token');
    const invitation = params.get('invite_token');
    const token = verification || invitation;
    const kind = verification ? 'verify-email' : invitation ? 'accept-invite' : null;
    if (!kind || !token) return;
    const active = new AbortController();
    api(`/auth/${kind}`, { method: 'POST', json: { token }, signal: active.signal })
      .then(async () => {
        if (!active.signal.aborted) {
          setLinkStatus(text('Bağlantı işlendi.', 'Link processed.'));
          window.history.replaceState({}, '', '/');
          setSession(await getCsrf(active.signal));
        }
      })
      .catch((error) => {
        if (!active.signal.aborted) setError(errorMessage(error));
      });
    return () => active.abort();
  }, [userId, text]);
  if (loading)
    return (
      <main className="auth-screen">
        <p role="status">{text('Oturum yükleniyor…', 'Loading session…')}</p>
      </main>
    );
  if (!session)
    return (
      <>
        <Auth
          onSession={(value) => {
            setSession(value);
            setError('');
          }}
        />
        {error && (
          <p className="auth-error error" role="alert">
            {error}
          </p>
        )}
      </>
    );
  let content: ReactNode;
  if (tab === 'settings' && !workspace)
    content = (
      <AccountControls
        workspace={null}
        user={session.user}
        onUsage={refreshUsage}
        onWorkspaceChanged={refreshWorkspaces}
        onDeleted={() => {
          clearSession();
          setSession(null);
          setProjectId('');
          setProjects([]);
          setUsage(null);
        }}
      />
    );
  else if (tab === 'projects' || !workspace)
    content = (
      <ProjectScreen
        key={workspaceId}
        workspace={workspace}
        projects={projects}
        onCreated={async (value) => {
          setProjects((items) => [...items, value]);
          setProjectId(value.id);
          navigate('profile');
        }}
        onWorkspaceCreated={async (value) => {
          await refreshWorkspaces();
          setWorkspaceId(value.id);
        }}
      />
    );
  else if (tab === 'settings')
    content = (
      <Settings
        key={workspace.id}
        workspace={workspace}
        user={session.user}
        onWorkspaceChanged={refreshWorkspaces}
        onUsage={refreshUsage}
        onDeleted={() => {
          clearSession();
          setSession(null);
          setProjectId('');
          setProjects([]);
          setUsage(null);
        }}
      />
    );
  else if (tab === 'help') content = <Help />;
  else if (tab === 'sources' && session.user.is_admin) content = <SourceAdmin isAdmin />;
  else if (tab === 'funding')
    content = (
      <FundingCatalog
        key={workspace.id}
        workspace={workspace}
        project={project || undefined}
        onSelectCall={(id) => {
          setSelectedCall(id);
          navigate('applications');
        }}
      />
    );
  else if (tab === 'incorporation')
    content = <IncorporationGuide key={workspace.id} workspace={workspace} />;
  else if (tab === 'dashboard')
    content = (
      <Dashboard
        key={`${workspace.id}:${project?.id || ''}`}
        workspace={workspace}
        project={project}
        projects={projects}
        usage={usage}
        onNavigate={navigate}
      />
    );
  else if (!project)
    content = (
      <section className="panel">
        <h1>{text('Proje seçin', 'Select a project')}</h1>
        <p>
          {state.error ||
            text(
              'Sol menüden kayıtlı proje seçin veya yeni proje oluşturun.',
              'Select a saved project from the navigation or create one.',
            )}
        </p>
        <button onClick={() => navigate('projects')}>{text('Projeler', 'Projects')}</button>
      </section>
    );
  else if (tab === 'profile')
    content = <ProfileScreen key={project.id} project={project} save={state.save} />;
  else if (tab === 'draft')
    content = (
      <DraftScreen key={project.id} project={project} save={state.save} reload={state.reload} />
    );
  else if (tab === 'idea-agent')
    content = (
      <IdeaAgent
        key={project.id}
        project={project}
        workspace={workspace}
        usage={usage}
        save={state.save}
        reload={state.reload}
        onUsage={refreshUsage}
      />
    );
  else if (tab === 'fund-matcher')
    content = (
      <FundMatcher
        key={project.id}
        workspace={workspace}
        project={project}
        onSelectCall={(id) => {
          setSelectedCall(id);
          navigate('applications');
        }}
      />
    );
  else if (tab === 'documents')
    content = (
      <DocumentManager
        key={project.id}
        project={project}
        workspace={workspace}
        onProjectChanged={state.reload}
        onUsage={refreshUsage}
      />
    );
  else if (tab === 'applications')
    content = (
      <ApplicationScreen
        key={project.id}
        project={project}
        workspace={workspace}
        selectedCall={selectedCall}
        onDiscover={() => navigate('funding')}
        onUsage={refreshUsage}
      />
    );
  else if (tab === 'collaboration')
    content = <CollaborationPanel key={project.id} workspace={workspace} project={project} />;
  else content = <Help />;
  return (
    <Layout
      session={session}
      workspace={workspace}
      workspaces={session.workspaces}
      projects={projects}
      projectId={projectId}
      activeTab={tab}
      onTabChange={navigate}
      onWorkspace={(id) => {
        setProjectId('');
        setProjects([]);
        setUsage(null);
        setWorkspaceId(id);
      }}
      onProject={(id) => {
        setSelectedCall('');
        setProjectId(id);
      }}
      onLogout={() => {
        void api('/auth/logout', { method: 'POST' })
          .then(() => {
            clearSession();
            setSession(null);
            setProjectId('');
            setProjects([]);
            setUsage(null);
          })
          .catch((error) => setError(errorMessage(error)));
      }}
    >
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {linkStatus && <p role="status">{linkStatus}</p>}
      {content}
    </Layout>
  );
}
