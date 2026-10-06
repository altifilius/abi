import { BookOpen, LifeBuoy, Sparkles } from 'lucide-react';
import type React from 'react';
import { useI18n } from '../i18n';

const Help: React.FC = () => {
  const { t } = useI18n();

  return (
    <div className="space-y-6 h-full">
      <div className="bg-glass-dark p-8 rounded-3xl border border-white/10 shadow-glass backdrop-blur-xl flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('help.title')}</h1>
          <p className="text-text-secondary text-sm mt-1">{t('help.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-glass-dark p-6 rounded-3xl border border-white/10 shadow-glass backdrop-blur-xl">
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="text-primary" size={20} />
            <h2 className="text-lg font-semibold text-white">{t('help.quickstart')}</h2>
          </div>
          <ul className="space-y-3 text-sm text-text-primary">
            <li>1. {t('help.step.install')}</li>
            <li>2. {t('help.step.env')}</li>
            <li>3. {t('help.step.dev')}</li>
          </ul>
        </section>

        <section className="bg-glass-dark p-6 rounded-3xl border border-white/10 shadow-glass backdrop-blur-xl">
          <div className="flex items-center gap-3 mb-4">
            <BookOpen className="text-secondary" size={20} />
            <h2 className="text-lg font-semibold text-white">{t('help.docs')}</h2>
          </div>
          <ul className="space-y-2 text-sm text-text-primary">
            <li>- {t('help.link.readme')}</li>
          </ul>
        </section>
      </div>

      <section className="bg-white/5 p-6 rounded-3xl border border-white/10 shadow-glass backdrop-blur-xl text-sm text-text-primary flex items-center gap-3">
        <LifeBuoy className="text-primary" size={20} />
        <span>{t('help.support')}</span>
      </section>
    </div>
  );
};

export default Help;
