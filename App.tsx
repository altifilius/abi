import type { ReactNode } from 'react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Auth from './components/Auth';
import Layout from './components/Layout';
import NotFound from './components/NotFound';
import { NavigationGuardProvider, useHasUnsavedChanges } from './contexts/NavigationGuard';
import { useI18n } from './i18n';
import { ApiError, api, clearSession, errorMessage, getCsrf } from './services/api';
import { parseProductRoute } from './services/navigation';
import { loadPreferences, savePreferences } from './services/persistence';
import type { Application, Project, Session, Usage } from './types';

const AccountScreen = lazy(() => import('./components/AccountScreen'));
const AdminScreen = lazy(() => import('./components/AdminScreen'));
const ApplicationDetail = lazy(() => import('./components/ApplicationDetail'));
const ApplicationList = lazy(() => import('./components/ApplicationList'));
const CalendarScreen = lazy(() => import('./components/CalendarScreen'));
const DocumentScreen = lazy(() => import('./components/DocumentScreen'));
const FundingScreen = lazy(() => import('./components/FundingScreen'));
const Help = lazy(() => import('./components/Help'));
const NotificationsScreen = lazy(() => import('./components/NotificationsScreen'));
const PasswordRecovery = lazy(() => import('./components/PasswordRecovery'));
const ProjectDetail = lazy(() => import('./components/ProjectDetail'));
const ProjectList = lazy(() => import('./components/ProjectList'));
const TaskScreen = lazy(() => import('./components/TaskScreen'));
const WorkspaceScreen = lazy(() => import('./components/WorkspaceScreen'));
const WorkspaceCreation = lazy(() =>
  import('./components/WorkspaceScreen').then((module) => ({ default: module.WorkspaceCreation })),
);

export default function App() {
  return (
    <NavigationGuardProvider>
      <ProductApplication />
    </NavigationGuardProvider>
  );
}

function ProductApplication() {
  const { text } = useI18n();
  const hasUnsavedChanges = useHasUnsavedChanges();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const route = parseProductRoute(location.pathname);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [entityLoading, setEntityLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [linkStatus, setLinkStatus] = useState('');
  const projectsScope = useRef<object | null>(null);
  const usageScope = useRef<object | null>(null);
  const authEpoch = useRef(0);
  const userId = session?.user.id;
  const remembered = loadPreferences();
  const defaultWorkspace =
    session?.workspaces.find((item) => item.id === remembered.workspaceId) ||
    session?.workspaces[0];
  const workspace = session?.workspaces.find((item) => item.id === route.workspaceId) || null;
  const selectedWorkspace = workspace || defaultWorkspace || null;
  const workspaceId = workspace?.id;
  const routeProjectId = route.projectId;
  const routeApplicationId = route.applicationId;
  const workspaceScope = useMemo(
    () => ({ key: `${userId}:${workspaceId}`, controller: null as AbortController | null }),
    [userId, workspaceId],
  );
  const entityScope = useMemo(
    () => ({
      key: `${userId}:${workspaceId}:${routeProjectId}:${routeApplicationId}`,
      controller: null as AbortController | null,
    }),
    [userId, workspaceId, routeProjectId, routeApplicationId],
  );
  const activeScopes = useRef({ workspace: workspaceScope, entity: entityScope });
  activeScopes.current = { workspace: workspaceScope, entity: entityScope };
  const visibleProjects = projectsScope.current === workspaceScope ? projects : [];
  const visibleUsage = usageScope.current === workspaceScope ? usage : null;
  const selectedProjectId =
    routeProjectId ||
    (routeApplicationId
      ? application?.project_id
      : searchParams.get('project') || remembered.projectId) ||
    '';
  const selectedProject =
    project && project.workspace_id === workspaceId && project.id === selectedProjectId
      ? project
      : visibleProjects.find((item) => item.id === selectedProjectId) || null;

  useEffect(() => {
    document.documentElement.dataset.theme = loadPreferences().theme || 'light';
    const controller = new AbortController();
    getCsrf(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setSession(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted && (!(reason instanceof ApiError) || reason.status !== 401))
          setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    workspaceScope.controller = controller;
    setProjects([]);
    setUsage(null);
    setError('');
    setProjectsLoading(!!workspaceId && !!userId);
    if (!workspaceId || !userId) return () => controller.abort();
    savePreferences({ workspaceId });
    Promise.all([
      api<Project[]>(`/workspaces/${workspaceId}/projects`, { signal: controller.signal }),
      api<Usage>(`/workspaces/${workspaceId}/usage`, { signal: controller.signal }),
    ])
      .then(([items, counter]) => {
        if (!controller.signal.aborted) {
          projectsScope.current = workspaceScope;
          usageScope.current = workspaceScope;
          setProjects(items);
          setUsage(counter);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setProjectsLoading(false);
      });
    return () => controller.abort();
  }, [workspaceId, userId, workspaceScope]);

  useEffect(() => {
    const controller = new AbortController();
    entityScope.controller = controller;
    setProject(null);
    setApplication(null);
    setEntityLoading(false);
    if (!workspaceId || !userId || (!routeProjectId && !routeApplicationId))
      return () => controller.abort();
    setEntityLoading(true);
    const load = async () => {
      if (routeApplicationId) {
        const value = await api<Application>(`/applications/${routeApplicationId}`, {
          signal: controller.signal,
        });
        if (value.workspace_id !== workspaceId) throw new ApiError('Record not found', 404);
        const owner = await api<Project>(`/projects/${value.project_id}`, {
          signal: controller.signal,
        });
        if (owner.workspace_id !== workspaceId) throw new ApiError('Record not found', 404);
        if (!controller.signal.aborted) {
          setApplication(value);
          setProject(owner);
        }
      } else if (routeProjectId) {
        const value = await api<Project>(`/projects/${routeProjectId}`, {
          signal: controller.signal,
        });
        if (value.workspace_id !== workspaceId) throw new ApiError('Record not found', 404);
        if (!controller.signal.aborted) setProject(value);
      }
    };
    load()
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setEntityLoading(false);
      });
    return () => controller.abort();
  }, [workspaceId, userId, routeProjectId, routeApplicationId, entityScope]);

  useEffect(() => {
    if (!userId) {
      setUnread(0);
      return;
    }
    const controller = new AbortController();
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      api<{ unread_count: number }>('/notifications/unread-count', { signal: controller.signal })
        .then((value) => {
          if (!controller.signal.aborted) setUnread(value.unread_count);
        })
        .catch(() => {});
    };
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [userId]);

  const refreshSession = useCallback(async () => {
    const epoch = authEpoch.current;
    const value = await getCsrf();
    if (epoch === authEpoch.current) setSession(value);
  }, []);
  const refreshProjects = useCallback(async () => {
    const controller = workspaceScope.controller;
    if (
      !workspaceId ||
      activeScopes.current.workspace !== workspaceScope ||
      !controller ||
      controller.signal.aborted
    )
      return;
    const value = await api<Project[]>(`/workspaces/${workspaceId}/projects`, {
      signal: controller.signal,
    });
    if (!controller.signal.aborted && activeScopes.current.workspace === workspaceScope) {
      projectsScope.current = workspaceScope;
      setProjects(value);
    }
  }, [workspaceId, workspaceScope]);
  const refreshUsage = useCallback(async () => {
    const controller = workspaceScope.controller;
    if (
      !workspaceId ||
      activeScopes.current.workspace !== workspaceScope ||
      !controller ||
      controller.signal.aborted
    )
      return;
    const value = await api<Usage>(`/workspaces/${workspaceId}/usage`, {
      signal: controller.signal,
    });
    if (!controller.signal.aborted && activeScopes.current.workspace === workspaceScope) {
      usageScope.current = workspaceScope;
      setUsage(value);
    }
  }, [workspaceId, workspaceScope]);
  const refreshWorkspaceMembership = useCallback(async () => {
    const controller = workspaceScope.controller;
    if (
      activeScopes.current.workspace !== workspaceScope ||
      !controller ||
      controller.signal.aborted
    )
      return;
    const value = await getCsrf(controller.signal);
    if (controller.signal.aborted || activeScopes.current.workspace !== workspaceScope) return;
    setSession(value);
    if (workspaceId && !value.workspaces.some((item) => item.id === workspaceId)) {
      navigate(
        value.workspaces[0] ? `/w/${value.workspaces[0].id}/projects` : '/account/identity',
        { replace: true },
      );
      return;
    }
    await refreshProjects();
  }, [workspaceId, workspaceScope, navigate, refreshProjects]);
  const refreshProject = useCallback(async () => {
    const controller = entityScope.controller;
    if (
      !project ||
      activeScopes.current.entity !== entityScope ||
      !controller ||
      controller.signal.aborted
    )
      return;
    const value = await api<Project>(`/projects/${project.id}`, { signal: controller.signal });
    if (
      !controller.signal.aborted &&
      activeScopes.current.entity === entityScope &&
      value.workspace_id === workspaceId
    )
      setProject((previous) =>
        previous?.id === value.id && previous.revision > value.revision ? previous : value,
      );
    await refreshProjects();
  }, [project, workspaceId, entityScope, refreshProjects]);
  const refreshApplication = useCallback(async () => {
    const controller = entityScope.controller;
    if (
      !routeApplicationId ||
      activeScopes.current.entity !== entityScope ||
      !controller ||
      controller.signal.aborted
    )
      return;
    const value = await api<Application>(`/applications/${routeApplicationId}`, {
      signal: controller.signal,
    });
    if (
      !controller.signal.aborted &&
      activeScopes.current.entity === entityScope &&
      value.workspace_id === workspaceId
    )
      setApplication((previous) =>
        previous?.id === value.id && previous.revision > value.revision ? previous : value,
      );
  }, [routeApplicationId, workspaceId, entityScope]);

  useEffect(() => {
    if (!userId) return;
    const params = new URLSearchParams(location.search);
    const verification = params.get('verify_email_token');
    const invitation = params.get('invite_token');
    const token = verification || invitation;
    if (!token) return;
    const controller = new AbortController();
    const operation = verification ? 'verify-email' : 'accept-invite';
    api(`/auth/${operation}`, { method: 'POST', json: { token }, signal: controller.signal })
      .then(async () => {
        if (controller.signal.aborted) return;
        const value = await getCsrf(controller.signal);
        if (controller.signal.aborted) return;
        setSession(value);
        setLinkStatus(text('Bağlantı işlendi.', 'Link processed.'));
        navigate(
          value.workspaces[0] ? `/w/${value.workspaces[0].id}/projects` : '/account/identity',
          { replace: true },
        );
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      });
    return () => controller.abort();
  }, [userId, location.search, navigate, text]);

  const endSession = () => {
    authEpoch.current += 1;
    workspaceScope.controller?.abort();
    entityScope.controller?.abort();
    clearSession();
    setSession(null);
    setProjects([]);
    setProject(null);
    setApplication(null);
    setUsage(null);
  };
  const logout = () => {
    if (hasUnsavedChanges) {
      setError(
        text(
          'Çıkış yapmadan önce değişiklikleri kaydedin veya bırakın.',
          'Save or discard changes before signing out.',
        ),
      );
      return;
    }
    void api('/auth/logout', { method: 'POST' })
      .then(() => {
        endSession();
        navigate('/', { replace: true });
      })
      .catch((reason) => setError(errorMessage(reason)));
  };
  if (loading)
    return (
      <main className="auth-screen">
        <p role="status">{text('Oturum yükleniyor…', 'Loading session…')}</p>
      </main>
    );
  if (route.menu === 'auth')
    return (
      <Suspense
        fallback={
          <main className="auth-screen">
            <p role="status">{text('Ekran yükleniyor…', 'Loading screen…')}</p>
          </main>
        }
      >
        <PasswordRecovery
          key={`${location.pathname}:${searchParams.get('token') || ''}`}
          onReset={endSession}
        />
      </Suspense>
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
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </>
    );
  if (location.pathname === '/') {
    if (searchParams.has('verify_email_token') || searchParams.has('invite_token'))
      return <p role="status">{text('Bağlantı işleniyor…', 'Processing link…')}</p>;
    return (
      <Navigate
        replace
        to={defaultWorkspace ? `/w/${defaultWorkspace.id}/projects` : '/account/identity'}
      />
    );
  }

  let content: ReactNode;
  if (route.workspaceId && !workspace) content = <NotFound workspaceId={defaultWorkspace?.id} />;
  else if (route.menu === 'not-found') content = <NotFound workspaceId={defaultWorkspace?.id} />;
  else if (route.menu === 'notifications') content = <NotificationsScreen user={session.user} />;
  else if (route.menu === 'account')
    content = (
      <AccountScreen
        user={session.user}
        section={route.section || 'identity'}
        onSessionChanged={refreshSession}
        onLogout={() => {
          endSession();
          navigate('/', { replace: true });
        }}
      />
    );
  else if (route.menu === 'workspace-create')
    content = <WorkspaceCreation onChanged={refreshSession} />;
  else if (route.menu === 'admin')
    content = <AdminScreen user={session.user} section={route.section || 'sources'} />;
  else if (route.menu === 'help')
    content = (
      <Help workspace={selectedWorkspace || undefined} project={selectedProject || undefined} />
    );
  else if (!workspace) content = <NotFound workspaceId={defaultWorkspace?.id} />;
  else if (projectsLoading && ['projects', 'funding'].includes(route.menu) && !route.projectId)
    content = (
      <div className="page-loading" role="status">
        {text('Çalışma alanın hazırlanıyor…', 'Getting your workspace ready…')}
      </div>
    );
  else if (route.menu === 'projects' && !route.projectId)
    content = (
      <ProjectList
        key={workspace.id}
        workspace={workspace}
        projects={visibleProjects}
        onChanged={refreshProjects}
      />
    );
  else if ((route.projectId || route.applicationId) && entityLoading)
    content = <p role="status">{text('Kayıt yükleniyor…', 'Loading record…')}</p>;
  else if (
    route.menu === 'projects' &&
    project?.workspace_id === workspace.id &&
    project.id === routeProjectId
  )
    content = (
      <ProjectDetail
        key={project.id}
        actorId={session.user.id}
        workspace={workspace}
        project={project}
        section={route.section || 'overview'}
        aiMode={route.aiMode}
        reportId={route.reportId}
        usage={visibleUsage}
        onProjectChanged={refreshProject}
        onUsage={refreshUsage}
        onProjectsChanged={refreshProjects}
      />
    );
  else if (route.menu === 'applications' && !route.applicationId)
    content = (
      <ApplicationList key={workspace.id} workspace={workspace} projects={visibleProjects} />
    );
  else if (
    route.menu === 'applications' &&
    application?.workspace_id === workspace.id &&
    application.id === routeApplicationId &&
    project?.workspace_id === workspace.id &&
    project.id === application.project_id
  )
    content = (
      <ApplicationDetail
        key={application.id}
        workspace={workspace}
        project={project}
        application={application}
        section={route.section || 'overview'}
        onChanged={refreshApplication}
        onUsage={refreshUsage}
      />
    );
  else if (route.menu === 'funding')
    content = (
      <FundingScreen
        key={workspace.id}
        workspace={workspace}
        projects={visibleProjects}
        programId={route.programId}
        callId={route.callId}
      />
    );
  else if (route.menu === 'documents')
    content = (
      <DocumentScreen
        key={workspace.id}
        workspace={workspace}
        projects={visibleProjects}
        onProjectChanged={refreshProjects}
        onUsage={refreshUsage}
      />
    );
  else if (route.menu === 'tasks')
    content = (
      <TaskScreen
        key={workspace.id}
        workspace={workspace}
        projects={visibleProjects}
        user={session.user}
      />
    );
  else if (route.menu === 'calendar')
    content = (
      <CalendarScreen key={workspace.id} workspace={workspace} projects={visibleProjects} />
    );
  else if (route.menu === 'workspace')
    content = (
      <WorkspaceScreen
        key={workspace.id}
        workspace={workspace}
        section={route.section || 'info'}
        usage={visibleUsage}
        onChanged={refreshWorkspaceMembership}
        onUsage={refreshUsage}
      />
    );
  else content = <NotFound workspaceId={workspace.id} />;

  return (
    <Layout
      session={session}
      workspace={selectedWorkspace}
      project={selectedProject}
      route={route}
      unreadCount={unread}
      onLogout={logout}
    >
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {linkStatus && <p role="status">{linkStatus}</p>}
      <div
        className={`screen-surface${route.menu === 'projects' || route.menu === 'funding' ? ' screen-surface-workspace' : ''}`}
        key={`${route.menu}:${routeProjectId || routeApplicationId || workspaceId || userId}`}
      >
        <Suspense
          key={`${route.menu}:${routeProjectId || routeApplicationId || workspaceId || userId}`}
          fallback={<p role="status">{text('Ekran yükleniyor…', 'Loading screen…')}</p>}
        >
          {content}
        </Suspense>
      </div>
    </Layout>
  );
}
