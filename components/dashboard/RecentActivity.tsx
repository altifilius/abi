import { FileText, FolderOpen, ShieldCheck } from 'lucide-react';
import type React from 'react';

interface ActivityItem {
  icon: 'folder' | 'shield' | 'file';
  title: string;
  subtitle: string;
  time: string;
}

interface RecentActivityProps {
  title: string;
  items: ActivityItem[];
}

export const RecentActivity: React.FC<RecentActivityProps> = ({ title, items }) => {
  const renderIcon = (icon: ActivityItem['icon']) => {
    switch (icon) {
      case 'folder':
        return (
          <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-secondary/20 rounded-md text-secondary">
            <FolderOpen
              size={20}
              className="icon-glow"
              style={{ '--glow-color': '#9B5DE5' } as React.CSSProperties}
            />
          </div>
        );
      case 'shield':
        return (
          <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-primary/20 rounded-md text-primary">
            <ShieldCheck
              size={20}
              className="icon-glow"
              style={{ '--glow-color': '#00F5D4' } as React.CSSProperties}
            />
          </div>
        );
      case 'file':
        return (
          <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-[#fca311]/20 rounded-md text-[#fca311]">
            <FileText
              size={20}
              style={
                {
                  fontVariationSettings: "'FILL' 1",
                  '--glow-color': '#fca311',
                } as React.CSSProperties
              }
            />
          </div>
        );
    }
  };

  return (
    <section className="bg-glass-dark p-6 rounded-3xl shadow-glass backdrop-blur-xl border border-white/10 flex flex-col">
      <h2 className="text-xl font-semibold mb-4 text-white">{title}</h2>
      <ul className="space-y-4 overflow-y-auto flex-grow pr-2">
        {items.map((item) => (
          <li key={item.title} className="flex items-start gap-4">
            {renderIcon(item.icon)}
            <div>
              <p className="font-semibold text-sm text-white">{item.title}</p>
              <p className="text-xs text-text-secondary">{item.subtitle}</p>
              <p className="text-xs text-text-secondary/80 mt-1">{item.time}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
