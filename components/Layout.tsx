import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import type { Project, Session, Workspace } from '../types';

interface Props {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  session: Session;
  workspace: Workspace | null;
  workspaces: Workspace[];
  projects: Project[];
  projectId: string;
  onWorkspace: (id: string) => void;
  onProject: (id: string) => void;
  onLogout: () => void;
}
export default function Layout(props: Props) {
  const { text, language, setLanguage } = useI18n();
  const [open, setOpen] = useState(false);
  const drawer = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement;
    drawer.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
      if (event.key === 'Tab') {
        const elements = Array.from(
          drawer.current?.querySelectorAll<HTMLElement>('button,select,a') || [],
        );
        if (event.shiftKey && document.activeElement === elements[0]) {
          event.preventDefault();
          elements.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === elements.at(-1)) {
          event.preventDefault();
          elements[0]?.focus();
        }
      }
    };
    document.addEventListener('keydown', keys);
    return () => {
      document.removeEventListener('keydown', keys);
      previous?.focus();
    };
  }, [open]);
  const items = [
    ['dashboard', 'Özet', 'Overview'],
    ['projects', 'Projeler / çalışma alanı', 'Projects / workspace'],
    ['profile', 'Proje profili', 'Project profile'],
    ['idea-agent', 'Fikir sohbeti', 'Idea conversation'],
    ['draft', 'Genel proje taslağı', 'General project draft'],
    ['funding', 'Fon keşfi (Ücretsiz)', 'Funding discovery (Free)'],
    ['fund-matcher', 'Uygunluk değerlendirmesi', 'Eligibility evaluation'],
    ['applications', 'Başvuru ve bütçe', 'Application & budget'],
    ['documents', 'Belgeler', 'Documents'],
    ['collaboration', 'Ekip / görev / takvim', 'Team / tasks / calendar'],
    ['incorporation', 'Şirket kuruluşu', 'Incorporation'],
    ['settings', 'Ayarlar', 'Settings'],
    ['help', 'Yardım', 'Help'],
  ];
  if (props.session.user.is_admin)
    items.push(['sources', 'Kaynak yayını (yönetici)', 'Source publication (admin)']);
  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          ref={toggle}
          type="button"
          className="mobile-menu"
          aria-controls="app-navigation"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {text('Menü', 'Menu')}
        </button>
        <strong>Abi</strong>
        <span className="plan">{props.workspace?.plan.toUpperCase() || 'FREE'}</span>
        <span className="user-name">{props.session.user.name}</span>
        <button onClick={props.onLogout}>{text('Çıkış', 'Logout')}</button>
      </header>
      {open && (
        <button
          className="drawer-backdrop"
          aria-label={text('Menüyü kapat', 'Close menu')}
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        id="app-navigation"
        ref={drawer}
        className={`sidebar ${open ? 'open' : ''}`}
        aria-label={text('Ana gezinme', 'Main navigation')}
        role="dialog"
        aria-modal={open || undefined}
      >
        <button className="mobile-menu" onClick={() => setOpen(false)}>
          {text('Kapat', 'Close')}
        </button>
        <label>
          {text('Çalışma alanı', 'Workspace')}
          <select
            value={props.workspace?.id || ''}
            onChange={(e) => props.onWorkspace(e.target.value)}
          >
            {props.workspaces.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {text('Proje', 'Project')}
          <select value={props.projectId} onChange={(e) => props.onProject(e.target.value)}>
            <option value="">{text('Proje seçin', 'Select a project')}</option>
            {props.projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <nav>
          {items.map(([id, tr, en]) => (
            <button
              key={id}
              className={props.activeTab === id ? 'selected' : ''}
              aria-current={props.activeTab === id ? 'page' : undefined}
              onClick={() => {
                props.onTabChange(id);
                setOpen(false);
              }}
            >
              {text(tr, en)}
            </button>
          ))}
        </nav>
        <label>
          {text('Dil', 'Language')}
          <select value={language} onChange={(e) => setLanguage(e.target.value as 'tr' | 'en')}>
            <option value="tr">Türkçe</option>
            <option value="en">English</option>
          </select>
        </label>
      </aside>
      <main id="main-content" className="main-content">
        {props.children}
      </main>
    </div>
  );
}
