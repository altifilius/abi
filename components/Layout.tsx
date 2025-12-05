import React, { useState } from 'react';
import { LayoutDashboard, MessageSquare, CheckCircle, FileText, Building2, Settings, HelpCircle, Menu, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { ABI_AVATAR_URL } from '../constants';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'idea-agent', label: 'AI Coach', icon: MessageSquare },
    { id: 'fund-matcher', label: 'Fund Matcher', icon: CheckCircle },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'incorporation', label: 'Incorporation', icon: Building2 },
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
          <div className={`flex items-center gap-3 mb-10 transition-all duration-300 ${isCollapsed ? 'justify-center' : ''}`}>
            <div className="bg-gradient-to-br from-primary to-secondary rounded-full p-0.5 shadow-glow-primary flex-shrink-0">
               <img 
                 alt="Abi - ScaleUp Inc." 
                 className="w-10 h-10 rounded-full bg-surface object-cover"
                 src={ABI_AVATAR_URL}
               />
            </div>
            <div className={`overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
              <h1 className="font-bold text-lg text-white whitespace-nowrap">ScaleUp Inc.</h1>
              <p className="text-sm text-text-secondary whitespace-nowrap">Project Workspace</p>
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
                  <Icon size={20} className={`flex-shrink-0 ${isActive ? "icon-glow" : ""}`} style={isActive ? { "--glow-color": "#00F5D4" } as React.CSSProperties : {}} />
                  <span className={`overflow-hidden transition-all duration-300 whitespace-nowrap ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                    {item.label}
                  </span>
                </button>
              );
            })}
             <button
                  title={isCollapsed ? "Schedule" : undefined}
                  className={`flex items-center gap-3 px-4 py-3 text-text-secondary hover:bg-white/5 hover:text-white rounded-2xl transition-colors ${isCollapsed ? 'justify-center px-2' : ''}`}
                >
                  <Calendar size={20} className="flex-shrink-0" />
                  <span className={`overflow-hidden transition-all duration-300 whitespace-nowrap ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                    Schedule
                  </span>
            </button>
          </nav>
        </div>

        <div className="flex flex-col gap-2">
           <button 
             title={isCollapsed ? "Settings" : undefined}
             className={`flex items-center gap-3 px-4 py-3 text-text-secondary hover:bg-white/5 hover:text-white rounded-2xl transition-colors ${isCollapsed ? 'justify-center px-2' : ''}`}
            >
             <Settings size={20} className="flex-shrink-0" />
             <span className={`overflow-hidden transition-all duration-300 whitespace-nowrap ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
               Settings
             </span>
           </button>
           <button 
             title={isCollapsed ? "Help" : undefined}
             className={`flex items-center gap-3 px-4 py-3 text-text-secondary hover:bg-white/5 hover:text-white rounded-2xl transition-colors ${isCollapsed ? 'justify-center px-2' : ''}`}
            >
             <HelpCircle size={20} className="flex-shrink-0" />
             <span className={`overflow-hidden transition-all duration-300 whitespace-nowrap ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
               Help
             </span>
           </button>
           
           <button 
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={`mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white rounded-full transition-all border border-white/10 ${isCollapsed ? 'px-2' : ''}`}
           >
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              <span className={`overflow-hidden transition-all duration-300 whitespace-nowrap ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100 text-sm'}`}>
                Collapse
              </span>
           </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden flex flex-col rounded-3xl relative">
        <div className="flex-1 overflow-y-auto scrollbar-hide">
            {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;