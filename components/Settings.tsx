import React from 'react';
import { Bell, Palette } from 'lucide-react';
import { useI18n } from '../i18n';

const Settings: React.FC = () => {
  const { t, language, setLanguage } = useI18n();

  return (
    <div className="space-y-6 h-full">
      <div className="bg-glass-dark p-8 rounded-3xl border border-white/10 shadow-glass backdrop-blur-xl flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('settings.title')}</h1>
          <p className="text-text-secondary text-sm mt-1">{t('settings.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-glass-dark p-6 rounded-3xl border border-white/10 shadow-glass backdrop-blur-xl">
          <div className="flex items-center gap-3 mb-4">
            <Palette className="text-primary" size={20} />
            <h2 className="text-lg font-semibold text-white">{t('settings.language')}</h2>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setLanguage('en')}
              className={`px-4 py-2 rounded-xl font-semibold border transition-all ${language === 'en' ? 'bg-primary text-background border-primary shadow-glow-primary' : 'bg-white/5 text-white border-white/10 hover:border-primary/40'}`}
            >
              English
            </button>
            <button
              onClick={() => setLanguage('tr')}
              className={`px-4 py-2 rounded-xl font-semibold border transition-all ${language === 'tr' ? 'bg-primary text-background border-primary shadow-glow-primary' : 'bg-white/5 text-white border-white/10 hover:border-primary/40'}`}
            >
              Türkçe
            </button>
          </div>
        </div>

        <div className="bg-glass-dark p-6 rounded-3xl border border-white/10 shadow-glass backdrop-blur-xl">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="text-secondary" size={20} />
            <h2 className="text-lg font-semibold text-white">{t('settings.notifications')}</h2>
          </div>
          <div className="space-y-3 text-sm text-white">
            <label className="flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
              <span>{t('settings.emailAlerts')}</span>
              <input type="checkbox" defaultChecked className="accent-primary w-5 h-5" />
            </label>
            <label className="flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
              <span>{t('settings.desktopAlerts')}</span>
              <input type="checkbox" defaultChecked className="accent-primary w-5 h-5" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
