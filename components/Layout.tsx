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
  projects: Project[];
  project: Project | null;
  route: ProductRoute;
  unreadCount: number;
  onLogout: () => void;
}
const MENU_LABELS: Record<string, [string, string]> = {
  overview: ['Özet', 'Overview'],
  projects: ['Projeler', 'Projects'],
  funding: ['Fon keşfi', 'Funding discovery'],
  applications: ['Başvurular', 'Applications'],
  documents: ['Belgeler', 'Documents'],
  tasks: ['Görevler', 'Tasks'],
  calendar: ['Takvim', 'Calendar'],
  workspace: ['Çalışma alanı yönetimi', 'Workspace management'],
  'workspace-create': ['Yeni çalışma alanı', 'New workspace'],
  account: ['Hesap ve tercihler', 'Account and preferences'],
  notifications: ['Bildirimler', 'Notifications'],
  admin: ['Yönetici konsolu', 'Administration'],
  help: ['Yardım', 'Help'],
};

export default function Layout({
  children,
  session,
  workspace,
  projects,
  project,
  route,
  unreadCount,
  onLogout,
}: Props) {
  const { text } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const drawer = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [mobileLocation, setMobileLocation] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<string | null>(null);
  const mobileOpen = mobileLocation === location.key;
  const userOpen = userLocation === location.key;
  const prefix = workspace ? `/w/${encodeURIComponent(workspace.id)}` : '';
  const mainMenus = [
    'overview',
    'projects',
    'funding',
    'applications',
    'documents',
    'tasks',
    'calendar',
  ];
  const labels = MENU_LABELS[route.menu] || [text('Sayfa', 'Page'), text('Sayfa', 'Page')];
  const contextualAction =
    project && route.menu === 'projects'
      ? {
          to: `${prefix}/projects/${project.id}/${route.section === 'profile' || route.section === 'budget' ? 'eligibility' : 'profile'}`,
          label:
            route.section === 'profile' || route.section === 'budget'
              ? text('Uygunluğu değerlendir', 'Evaluate eligibility')
              : text('Profili düzenle', 'Edit profile'),
        }
      : route.applicationId
        ? {
            to: `${prefix}/applications/${route.applicationId}/${route.section === 'review' ? 'package' : 'review'}`,
            label:
              route.section === 'review'
                ? text('Onaylı paket', 'Approved package')
                : text('İnceleme ve onay', 'Review and approval'),
          }
        : { to: `${prefix}/projects?create=true`, label: text('Yeni proje', 'New project') };
  useEffect(() => {
    if (mobileOpen) drawer.current?.showModal();
    else drawer.current?.close();
  }, [mobileOpen]);
  const navigation = (
    <>
      <div className="sidebar-brand">
        <strong>Abi</strong>
        <span>{text('Proje çalışma alanı', 'Project workspace')}</span>
      </div>
      <nav aria-label={text('Ana menüler', 'Main menus')}>
        {mainMenus.map((menu) => (
          <NavLink
            key={menu}
            to={prefix ? `${prefix}/${menu}` : '/account/identity'}
            end={menu === 'overview'}
            className={({ isActive }) => (isActive && route.menu === menu ? 'selected' : '')}
          >
            {text(...MENU_LABELS[menu])}
            {['applications', 'tasks'].includes(menu) && workspace?.plan === 'free' && (
              <small className="menu-entitlement">Pro</small>
            )}
          </NavLink>
        ))}
      </nav>
      <nav
        className="secondary-navigation"
        aria-label={text('Yönetim ve yardım', 'Management and help')}
      >
        <NavLink
          to={prefix ? `${prefix}/workspace/info` : '/workspaces/new'}
          className={route.menu === 'workspace' ? 'selected' : ''}
        >
          {text('Çalışma alanı yönetimi', 'Workspace management')}
        </NavLink>
        <NavLink to="/help">{text('Yardım', 'Help')}</NavLink>
        {session.user.is_admin && (
          <NavLink to="/admin/sources">{text('Yönetici konsolu', 'Administration')}</NavLink>
        )}
      </nav>
    </>
  );
  return (
    <div className="product-shell">
      <a className="skip-link" href="#main-content">
        {text('Ana içeriğe geç', 'Skip to main content')}
      </a>
      <aside className="desktop-sidebar">{navigation}</aside>
      <header className="product-topbar">
        <button
          ref={menuButton}
          className="mobile-menu"
          type="button"
          aria-controls="mobile-navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileLocation(location.key)}
        >
          {text('Menü', 'Menu')}
        </button>
        <div className="header-selectors">
          <label>
            {text('Çalışma alanı', 'Workspace')}
            <select
              value={workspace?.id || ''}
              onChange={(event) =>
                navigate(`/w/${encodeURIComponent(event.target.value)}/overview`)
              }
            >
              {!workspace && <option value="">{text('Seçin', 'Select')}</option>}
              {session.workspaces.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {text('Proje', 'Project')}
            <select
              value={project?.id || ''}
              onChange={(event) =>
                navigate(
                  event.target.value
                    ? `${prefix}/projects/${encodeURIComponent(event.target.value)}/overview`
                    : `${prefix}/projects`,
                )
              }
              disabled={!workspace}
            >
              <option value="">{text('Proje seçin', 'Select project')}</option>
              {projects.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <span className="plan">{workspace?.plan.toUpperCase() || 'FREE'}</span>
        <Link
          className="notification-trigger"
          to="/notifications"
          aria-label={`${text('Bildirimler', 'Notifications')}: ${unreadCount}`}
        >
          {text('Bildirimler', 'Notifications')}
          {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
        </Link>
        <div className="user-menu">
          <button
            type="button"
            aria-expanded={userOpen}
            aria-controls="user-navigation"
            onClick={() => setUserLocation(userOpen ? null : location.key)}
          >
            {session.user.name}
          </button>
          {userOpen && (
            <nav
              id="user-navigation"
              aria-label={text('Kullanıcı menüsü', 'User menu')}
              className="user-dropdown"
            >
              <Link to="/account/identity">{text('Hesabım', 'My account')}</Link>
              <Link to="/account/security">{text('Hesap güvenliği', 'Account security')}</Link>
              <Link to="/account/preferences">
                {text('Dil, tema ve bildirimler', 'Language, theme and notifications')}
              </Link>
              <Link to="/account/privacy">{text('Veri ve gizlilik', 'Data and privacy')}</Link>
              <button type="button" onClick={onLogout}>
                {text('Çıkış yap', 'Sign out')}
              </button>
            </nav>
          )}
        </div>
      </header>
      <div className="content-location">
        <nav aria-label={text('Konum', 'Breadcrumb')}>
          {workspace && (
            <>
              <Link to={`${prefix}/overview`}>{workspace.name}</Link>
              <span aria-hidden="true"> / </span>
            </>
          )}
          <span>{text(...labels)}</span>
          {project && (
            <>
              <span aria-hidden="true"> / </span>
              <Link to={`${prefix}/projects/${project.id}/overview`}>{project.title}</Link>
            </>
          )}
        </nav>
        {workspace && (
          <Link className="button-link" to={contextualAction.to}>
            {contextualAction.label}
          </Link>
        )}
      </div>
      <main id="main-content" className="main-content" tabIndex={-1}>
        {children}
      </main>
      <dialog
        id="mobile-navigation"
        ref={drawer}
        className="mobile-navigation"
        aria-label={text('Ana gezinme', 'Main navigation')}
        onCancel={() => setMobileLocation(null)}
        onClose={() => {
          setMobileLocation(null);
          menuButton.current?.focus();
        }}
      >
        <button type="button" className="drawer-close" onClick={() => setMobileLocation(null)}>
          {text('Menüyü kapat', 'Close menu')}
        </button>
        {navigation}
      </dialog>
    </div>
  );
}
