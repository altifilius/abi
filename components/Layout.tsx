import {
  Building2,
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  HelpCircle,
  LayoutDashboard,
  MessageSquare,
  Settings,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { ABI_AVATAR_URL } from '../constants';
import { useI18n } from '../i18n';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { t, language, setLanguage } = useI18n();

  const navItems = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { id: 'idea-agent', label: t('nav.aiCoach'), icon: MessageSquare },
    { id: 'fund-matcher', label: t('nav.fundMatcher'), icon: CheckCircle },
    { id: 'documents', label: t('nav.documents'), icon: FileText },
    { id: 'incorporation', label: t('nav.incorporation'), icon: Building2 },
    { id: 'settings', label: t('nav.settings'), icon: Settings },
    { id: 'help', label: t('nav.help'), icon: HelpCircle },
  ];

  return (
    <div className="flex h-screen p-4 gap-4 overflow-hidden">
      {/* Floating Glass Sidebar */}
      <aside
        className={`${
          isCollapsed ? 'w-24 px-4' : 'w-64 px-6'
        } flex-shrink-0 bg-glass-dark/50 backdrop-blur-xl flex flex-col justify-between rounded-3xl border border-white/10 shadow-glass transition-all duration-300 ease-in-out py-6`}
      >
        <div>
          <div
            className={`flex items-center gap-3 mb-10 transition-all duration-300 ${isCollapsed ? 'justify-center' : ''}`}
          >
            <div className="bg-gradient-to-br from-primary to-secondary rounded-full p-0.5 shadow-glow-primary flex-shrink-0">
              <img
                alt="Abi - ScaleUp Inc."
                className="w-10 h-10 rounded-full bg-surface object-cover"
                src={ABI_AVATAR_URL}
              />
            </div>
            <div
              className={`overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}
            >
              <h1 className="font-bold text-lg text-white whitespace-nowrap">ScaleUp Inc.</h1>
              <p className="text-sm text-text-secondary whitespace-nowrap">
                {t('layout.workspace')}
              </p>
            </div>
          </div>

          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 group ${
                    isActive
                      ? 'bg-primary/20 text-primary font-semibold shadow-[inset_0_0_20px_rgba(0,245,212,0.1)]'
                      : 'text-text-secondary hover:bg-white/5 hover:text-white'
                  } ${isCollapsed ? 'justify-center px-2' : ''}`}
                >
                  <Icon
                    size={20}
                    className={`flex-shrink-0 ${isActive ? 'icon-glow' : ''}`}
                    style={isActive ? ({ '--glow-color': '#00F5D4' } as React.CSSProperties) : {}}
                  />
                  <span
                    className={`overflow-hidden transition-all duration-300 whitespace-nowrap ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
            <button
              title={isCollapsed ? t('nav.schedule') : undefined}
              className={`flex items-center gap-3 px-4 py-3 text-text-secondary hover:bg-white/5 hover:text-white rounded-2xl transition-colors ${isCollapsed ? 'justify-center px-2' : ''}`}
            >
              <Calendar size={20} className="flex-shrink-0" />
              <span
                className={`overflow-hidden transition-all duration-300 whitespace-nowrap ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}
              >
                {t('nav.schedule')}
              </span>
            </button>
          </nav>
        </div>

        <div className="flex flex-col gap-2">
          <div
            className={`flex items-center gap-2 px-4 py-3 text-text-secondary rounded-2xl transition-colors ${isCollapsed ? 'justify-center px-2' : 'justify-between'}`}
          >
            {!isCollapsed && (
              <span className="text-xs uppercase tracking-wide">{t('layout.language')}</span>
            )}
            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <button
                onClick={() => setLanguage('en')}
                className={`px-3 py-2 text-xs font-semibold ${language === 'en' ? 'bg-primary text-background' : 'text-white/80'}`}
              >
                EN
              </button>
              <button
                onClick={() => setLanguage('tr')}
                className={`px-3 py-2 text-xs font-semibold ${language === 'tr' ? 'bg-primary text-background' : 'text-white/80'}`}
              >
                TR
              </button>
            </div>
          </div>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white rounded-full transition-all border border-white/10 ${isCollapsed ? 'px-2' : ''}`}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            <span
              className={`overflow-hidden transition-all duration-300 whitespace-nowrap ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100 text-sm'}`}
            >
              Collapse
            </span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden flex flex-col rounded-3xl relative">
        <div className="flex-1 overflow-y-auto scrollbar-hide">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
