import type React from 'react';

interface ScheduleItem {
  month: string;
  day: string;
  title: string;
  subtitle: string;
  isHighlighted?: boolean;
}

interface UpcomingScheduleProps {
  title: string;
  items: ScheduleItem[];
}

export const UpcomingSchedule: React.FC<UpcomingScheduleProps> = ({ title, items }) => {
  return (
    <section className="bg-glass-dark p-6 rounded-3xl shadow-glass backdrop-blur-xl border border-white/10 flex flex-col">
      <h2 className="text-xl font-semibold mb-4 text-white">{title}</h2>
      <ul className="space-y-4 overflow-y-auto flex-grow pr-2">
        {items.map((item) => (
          <li key={item.title} className="flex items-start gap-4">
            <div
              className={`rounded-md w-10 h-10 flex-shrink-0 flex flex-col items-center justify-center ring-4 ring-surface ${
                item.isHighlighted ? 'bg-primary text-background shadow-glow-primary' : 'bg-surface'
              }`}
            >
              <span
                className={`text-xs font-bold ${
                  item.isHighlighted ? 'text-background' : 'text-text-secondary'
                }`}
              >
                {item.month}
              </span>
              <span
                className={`text-sm font-bold ${
                  item.isHighlighted ? 'text-background' : 'text-white'
                }`}
              >
                {item.day}
              </span>
            </div>
            <div>
              <p className="font-semibold text-sm text-white">{item.title}</p>
              <p className="text-xs text-text-secondary">{item.subtitle}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
