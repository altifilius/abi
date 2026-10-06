import { Bell, FileText, ShieldCheck, TrendingUp } from 'lucide-react';
import type React from 'react';
import { FUNDS } from '../constants';
import { useI18n } from '../i18n';
import type { Project } from '../types';
import { ProgressWidget } from './dashboard/ProgressWidget';
import { QuickActions } from './dashboard/QuickActions';
import { RecentActivity } from './dashboard/RecentActivity';
import { UpcomingSchedule } from './dashboard/UpcomingSchedule';

interface DashboardProps {
  project: Project;
  onNavigate: (tab: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ project, onNavigate }) => {
  const { t } = useI18n();

  const hasDescription = !!project.description;
  const hasMatches = project.matchedFunds && project.matchedFunds.length > 0;
  const missingDocs = project.documents.filter((d) => d.status === 'missing').length;
  const totalDocs = project.documents.length;
  const docProgress = totalDocs > 0 ? Math.round(((totalDocs - missingDocs) / totalDocs) * 100) : 0;

  let overallProgress = 0;
  if (hasDescription) overallProgress += 20;
  if (hasMatches) overallProgress += 30;
  overallProgress += Math.round(docProgress * 0.5);

  const sortedMatches =
    project.matchedFunds && project.matchedFunds.length > 0
      ? [...project.matchedFunds].sort((a, b) => b.score - a.score)
      : [];
  const topMatch = sortedMatches[0];
  const topFund = topMatch ? FUNDS.find((f) => f.id === topMatch.fundId) : undefined;
  const potentialFunding = topFund ? topFund.maxBudget : '—';
  const potentialFundingSub = topFund
    ? `${topFund.name} (${topMatch.score}%)`
    : t('dashboard.fundingPotentialSub');

  const quickActionsList = [
    {
      tab: 'documents',
      icon: 'folder' as const,
      color: 'primary' as const,
      title: t('dashboard.documentVaultTitle'),
      subtitle: t('dashboard.documentVaultSub'),
    },
    {
      tab: 'idea-agent',
      icon: 'support' as const,
      color: 'primary' as const,
      title: t('dashboard.getSupportTitle'),
      subtitle: t('dashboard.getSupportSub'),
    },
    {
      tab: 'fund-matcher',
      icon: 'calculator' as const,
      color: 'primary' as const,
      title: t('dashboard.budgetTitle'),
      subtitle: t('dashboard.budgetSub'),
    },
    {
      tab: 'idea-agent',
      icon: 'plus' as const,
      color: 'secondary' as const,
      title: t('dashboard.newIdeaTitle'),
      subtitle: t('dashboard.newIdeaSub'),
    },
    {
      tab: 'fund-matcher',
      icon: 'trending' as const,
      color: 'secondary' as const,
      title: t('dashboard.eligibilityTitle'),
      subtitle: t('dashboard.eligibilitySub'),
    },
    {
      tab: 'incorporation',
      icon: 'activity' as const,
      color: 'secondary' as const,
      title: t('dashboard.companySetupTitle'),
      subtitle: t('dashboard.companySetupSub'),
    },
    {
      tab: 'incorporation',
      icon: 'checklist' as const,
      color: 'primary' as const,
      title: t('dashboard.registrationChecklistTitle'),
      subtitle: t('dashboard.registrationChecklistSub'),
    },
  ];

  const scheduleItems = [
    {
      month: 'DEC',
      day: '21',
      title: t('dashboard.schedule1Title'),
      subtitle: t('dashboard.schedule1Sub'),
      isHighlighted: true,
    },
    {
      month: 'JAN',
      day: '05',
      title: t('dashboard.schedule2Title'),
      subtitle: t('dashboard.schedule2Sub'),
    },
    {
      month: 'JAN',
      day: '12',
      title: t('dashboard.schedule3Title'),
      subtitle: t('dashboard.schedule3Sub'),
    },
  ];

  const recentActivities = [
    {
      icon: 'folder' as const,
      title: t('dashboard.activityDocUpdateTitle'),
      subtitle: t('dashboard.activityDocUpdateSub'),
      time: t('dashboard.activityDocUpdateTime'),
    },
    {
      icon: 'shield' as const,
      title: t('dashboard.activityEligibilityTitle'),
      subtitle: t('dashboard.activityEligibilitySub'),
      time: t('dashboard.activityEligibilityTime'),
    },
    {
      icon: 'file' as const,
      title: t('dashboard.activityReviewTitle'),
      subtitle: t('dashboard.activityReviewSub'),
      time: t('dashboard.activityReviewTime'),
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full pb-6">
      <div className="lg:col-span-2 grid grid-rows-[auto_auto_1fr] gap-4">
        {/* Header */}
        <header className="bg-glass-dark p-8 rounded-3xl shadow-glass backdrop-blur-xl border border-white/10 flex items-center justify-between bg-iridescent relative overflow-hidden group">
          <div className="relative z-10 flex flex-col justify-center">
            <h1 className="text-4xl font-bold text-white mb-2">ScaleUp Inc.</h1>
            <p className="text-text-secondary">{t('dashboard.welcome')}</p>
          </div>
          <div className="relative z-10 text-right flex flex-col items-end">
            <h3 className="text-lg font-medium text-text-secondary mb-2">
              {t('dashboard.nextSubmission')}
            </h3>
            <div className="flex items-baseline gap-3">
              <span
                className="text-7xl font-bold text-primary"
                style={{ textShadow: '0 0 12px rgba(0, 245, 212, 0.6)' }}
              >
                15
              </span>
              <span className="text-3xl font-semibold text-primary/80">{t('dashboard.days')}</span>
            </div>
            <p className="text-text-secondary mt-1">{t('dashboard.nextProgram')}</p>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ProgressWidget
            title={t('dashboard.dynamicProgress')}
            overallProgress={overallProgress}
            completedText={t('dashboard.completed')}
            milestonesText={t('dashboard.milestones')}
            nextTaskText={t('dashboard.nextTask')}
          />

          {/* Funding Potential Widget */}
          <div className="bg-glass-dark p-6 rounded-2xl shadow-glass backdrop-blur-xl border border-white/10 flex flex-col justify-center items-center text-center hover:border-secondary/30 transition-all">
            <h3 className="text-sm font-medium text-text-secondary mb-3">
              {t('dashboard.fundingPotential')}
            </h3>
            <TrendingUp
              size={48}
              className="text-primary mb-2 icon-glow"
              style={{ '--glow-color': '#00F5D4' } as React.CSSProperties}
            />
            <p className="text-3xl font-bold text-white">{potentialFunding}</p>
            <p className="text-xs text-text-secondary mt-1">{potentialFundingSub}</p>
          </div>

          {/* Notifications Widget */}
          <div className="bg-glass-dark p-6 rounded-2xl shadow-glass backdrop-blur-xl border border-white/10 flex flex-col justify-between">
            <h3 className="text-sm font-medium text-text-secondary mb-4 flex items-center gap-2">
              <Bell size={16} className="text-white" /> {t('dashboard.notifications')}
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <ShieldCheck size={16} style={{ fontVariationSettings: "'FILL' 1" }} />
                </div>
                <p className="text-xs text-text-secondary">
                  <span className="font-semibold text-white">
                    {t('dashboard.notificationGrant')}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-secondary/10 text-secondary flex items-center justify-center flex-shrink-0">
                  <FileText size={16} />
                </div>
                <p className="text-xs text-text-secondary">
                  <span className="font-semibold text-white">{t('dashboard.notificationDoc')}</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('documents')}
              className="text-xs text-primary mt-4 text-left hover:underline"
            >
              {t('dashboard.viewAll')}
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <QuickActions
          title={t('dashboard.quickActions')}
          onNavigate={onNavigate}
          actions={quickActionsList}
        />
      </div>

      {/* Right Sidebar Column */}
      <div className="lg:col-span-1 grid grid-rows-2 gap-4">
        <UpcomingSchedule title={t('dashboard.upcomingSchedule')} items={scheduleItems} />
        <RecentActivity title={t('dashboard.recentActivity')} items={recentActivities} />
      </div>
    </div>
  );
};

export default Dashboard;
