import type React from 'react';

interface ProgressWidgetProps {
  title: string;
  overallProgress: number;
  completedText: string;
  milestonesText: string;
  nextTaskText: string;
}

export const ProgressWidget: React.FC<ProgressWidgetProps> = ({
  title,
  overallProgress,
  completedText,
  milestonesText,
  nextTaskText,
}) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius; // ~251.2
  const strokeDashoffset = circumference - (overallProgress / 100) * circumference;

  return (
    <div className="bg-glass-dark p-6 rounded-2xl shadow-glass backdrop-blur-xl border border-white/10 flex flex-col items-center justify-center text-center group hover:border-primary/30 transition-all overflow-hidden relative">
      <h3 className="text-sm font-medium text-text-secondary mb-3 z-10">{title}</h3>
      <div className="relative w-36 h-36 z-10">
        <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-300 opacity-100 group-hover:opacity-0">
          <svg className="w-full h-full" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00F5D4" />
                <stop offset="100%" stopColor="#9B5DE5" />
              </linearGradient>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Outer Decorative Ring */}
            <circle
              className="text-white/5 animate-[spin_8s_linear_infinite] origin-center"
              cx="50"
              cy="50"
              fill="transparent"
              r="46"
              stroke="currentColor"
              strokeWidth="0.5"
              strokeDasharray="4 2"
            />

            {/* Track */}
            <circle
              className="text-surface"
              cx="50"
              cy="50"
              fill="transparent"
              r="40"
              stroke="currentColor"
              strokeWidth="6"
            />

            {/* Progress Line */}
            <circle
              className="transition-all duration-1000 ease-out"
              cx="50"
              cy="50"
              fill="transparent"
              r="40"
              stroke="url(#progressGradient)"
              strokeLinecap="round"
              strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ filter: 'url(#glow)' }}
              transform="rotate(-90 50 50)"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <span className="text-3xl font-bold text-white drop-shadow-[0_0_8px_rgba(0,245,212,0.5)]">
              {overallProgress}%
            </span>
            <span className="text-[10px] text-text-secondary uppercase tracking-widest opacity-70">
              {completedText}
            </span>
          </div>
        </div>

        {/* Hover State Detail View */}
        <div className="absolute inset-0 bg-glass-dark/95 backdrop-blur-md rounded-full flex flex-col items-center justify-center p-4 text-center transition-all duration-500 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 border border-white/10">
          <h4 className="text-xs font-bold text-white mb-2">{milestonesText}</h4>
          <div className="w-full bg-surface rounded-full h-1.5 mb-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-primary to-secondary h-1.5 rounded-full"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <p className="text-[10px] leading-tight text-text-secondary">
            <span className="font-semibold text-primary">Next:</span> {nextTaskText}
          </p>
        </div>
      </div>
    </div>
  );
};
