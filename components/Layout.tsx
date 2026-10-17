import {
  Bell,
  ChevronDown,
  CircleHelp,
  LogOut,
  Settings2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import type { ProductRoute } from '../services/navigation';
import type { Project, Session, Workspace } from '../types';

interface Props {
  children: ReactNode;
  session: Session;
  workspace: Workspace | null;
  project: Project | null;
  route: ProductRoute;
  unreadCount: number;
  onLogout: () => void;
}

export default function Layout({
  children,
  session,
  workspace,
  project,
  route,
  unreadCount,
  onLogout,
}: Props) {
  const { text } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [userLocation, setUserLocation] = useState<string | null>(null);
  const userOpen = userLocation === location.key;
  const userMenu = useRef<HTMLDivElement>(null);
  const userButton = useRef<HTMLButtonElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const prefix = workspace ? `/w/${encodeURIComponent(workspace.id)}` : '';
  const projectsPath = prefix ? `${prefix}/projects` : '/workspaces/new';
  const fundingPath = prefix ? `${prefix}/funding` : '/workspaces/new';
  const fundingActive = route.menu === 'funding';
  const projectActive = ['projects', 'applications', 'documents', 'tasks', 'calendar'].includes(
    route.menu,
  );
  useEffect(() => {
    const update = () => {
      viewport.current?.style.setProperty(
        '--workspace-height',
        `${window.visualViewport?.height || window.innerHeight}px`,
      );
    };
    update();
    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  useEffect(() => {
    if (!userOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !userMenu.current?.contains(event.target))
        setUserLocation(null);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setUserLocation(null);
        userButton.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [userOpen]);
  return (
    <div className="product-shell" ref={viewport}>
      <a className="skip-link" href="#main-content">
        {text('Ana içeriğe geç', 'Skip to main content')}
      </a>
      <header className="product-header">
        <div className="product-header-inner">
          <Link
            className="brand"
            to={projectsPath}
            aria-label={text('Abi · Projelerim', 'Abi · My projects')}
          >
            <span className="brand-mark" aria-hidden="true">
              <Sparkles size={21} strokeWidth={1.7} />
            </span>
            <span>
              abi<span className="brand-dot">.</span>
            </span>
          </Link>
          <nav className="primary-navigation" aria-label={text('Ana gezinme', 'Main navigation')}>
            <NavLink
              to={projectsPath}
              className={projectActive ? 'selected' : ''}
              aria-current={projectActive ? 'page' : undefined}
            >
              {text('Projelerim', 'My projects')}
            </NavLink>
            <NavLink
              to={fundingPath}
              className={fundingActive ? 'selected' : ''}
              aria-current={fundingActive ? 'page' : undefined}
            >
              {text('Destek bul', 'Find support')}
            </NavLink>
          </nav>
          <div className="header-account">
            <Link
              className="icon-button notification-trigger"
              to="/notifications"
              aria-label={`${text('Bildirimler', 'Notifications')}: ${unreadCount}`}
            >
              <Bell size={20} strokeWidth={1.7} />
              {unreadCount > 0 && (
                <span className="notification-dot">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </Link>
            <div className="user-menu" ref={userMenu}>
              <button
                ref={userButton}
                className="account-trigger"
                type="button"
                aria-expanded={userOpen}
                aria-controls="user-navigation"
                aria-label={text('Hesap menüsü', 'Account menu')}
                onClick={() => setUserLocation(userOpen ? null : location.key)}
              >
                <span className="user-avatar">
                  {session.user.name.trim().slice(0, 1).toLocaleUpperCase()}
                </span>
                <ChevronDown size={14} />
              </button>
              {userOpen && (
                <nav
                  id="user-navigation"
                  className="user-dropdown"
                  aria-label={text('Hesap ve çalışma alanları', 'Account and workspaces')}
                >
                  <div className="user-dropdown-heading">
                    <strong>{session.user.name}</strong>
                    <span>{session.user.email}</span>
                  </div>
                  <label className="workspace-switcher">
                    {text('Çalışma alanı', 'Workspace')}
                    <select
                      value={workspace?.id || ''}
                      onChange={(event) =>
                        navigate(`/w/${encodeURIComponent(event.target.value)}/projects`)
                      }
                    >
                      {!workspace && <option value="">{text('Seçin', 'Select')}</option>}
                      {session.workspaces.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Link to="/account/identity">
                    <Settings2 size={16} />
                    {text('Hesap ve tercihler', 'Account and preferences')}
                  </Link>
                  {prefix && (
                    <Link to={`${prefix}/workspace/info`}>
                      {text('Çalışma alanı ve ekip', 'Workspace and team')}
                    </Link>
                  )}
                  <Link to="/workspaces/new">{text('Yeni çalışma alanı', 'New workspace')}</Link>
                  <Link to="/help">
                    <CircleHelp size={16} />
                    {text('Yardım', 'Help')}
                  </Link>
                  {session.user.is_admin && (
                    <Link to="/admin/sources">
                      <ShieldCheck size={16} />
                      {text('Yönetici konsolu', 'Administration')}
                    </Link>
                  )}
                  <button type="button" onClick={onLogout}>
                    <LogOut size={16} />
                    {text('Çıkış yap', 'Sign out')}
                  </button>
                </nav>
              )}
            </div>
          </div>
        </div>
      </header>
      <main
        id="main-content"
        className={`main-content${route.section === 'report' ? ' editor-page' : ''}${route.section === 'ai' ? ' studio-page' : ''}`}
        tabIndex={-1}
        data-menu={route.menu}
        data-section={route.section || 'list'}
      >
        {project && !['projects', 'funding'].includes(route.menu) && (
          <Link className="context-back" to={`${prefix}/projects/${project.id}/overview`}>
            ← {project.title} · {text('Proje dosyası', 'Project file')}
          </Link>
        )}
        {children}
      </main>
    </div>
  );
}
