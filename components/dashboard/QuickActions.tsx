import {
  Activity,
  Calculator,
  ClipboardCheck,
  FolderOpen,
  LifeBuoy,
  PlusCircle,
  TrendingUp,
} from 'lucide-react';
import type React from 'react';

interface QuickActionsProps {
  title: string;
  onNavigate: (tab: string) => void;
  actions: {
    tab: string;
    icon: 'folder' | 'support' | 'calculator' | 'plus' | 'trending' | 'activity' | 'checklist';
    color: 'primary' | 'secondary';
    title: string;
    subtitle: string;
  }[];
}

export const QuickActions: React.FC<QuickActionsProps> = ({ title, onNavigate, actions }) => {
  const renderIcon = (
    icon: QuickActionsProps['actions'][number]['icon'],
    color: 'primary' | 'secondary',
  ) => {
    const glowColor = color === 'primary' ? '#00F5D4' : '#9B5DE5';
    const textClass = color === 'primary' ? 'text-primary' : 'text-secondary';
    const props = {
      className: `${textClass} icon-glow group-hover:scale-110 transition-transform mb-2`,
      style: { '--glow-color': glowColor } as React.CSSProperties,
      size: 32,
    };

    switch (icon) {
      case 'folder':
        return <FolderOpen {...props} />;
      case 'support':
        return <LifeBuoy {...props} />;
      case 'calculator':
        return <Calculator {...props} />;
      case 'plus':
        return <PlusCircle {...props} />;
      case 'trending':
        return <TrendingUp {...props} />;
      case 'activity':
        return <Activity {...props} />;
      case 'checklist':
        return <ClipboardCheck {...props} />;
    }
  };

  return (
    <div className="bg-glass-dark p-6 rounded-3xl shadow-glass backdrop-blur-xl border border-white/10 flex flex-col">
      <h2 className="text-xl font-semibold mb-4 text-white">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-grow">
        {actions.map((act) => (
          <button
            key={act.title}
            onClick={() => onNavigate(act.tab)}
            className="bg-white/5 hover:bg-white/10 transition-all p-4 rounded-2xl flex flex-col items-center justify-center text-center border border-white/10 hover:border-primary/50 group"
          >
            {renderIcon(act.icon, act.color)}
            <span className="font-semibold text-sm text-white">{act.title}</span>
            <span className="text-xs text-text-secondary">{act.subtitle}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
