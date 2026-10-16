import type React from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { loadPreferences, savePreferences } from './services/persistence';
export type Language = 'en' | 'tr';
interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  text: (tr: string, en: string) => string;
}
const I18nContext = createContext<I18nContextValue | null>(null);
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(
    () =>
      loadPreferences().language ||
      (typeof navigator !== 'undefined' && navigator.language.startsWith('tr') ? 'tr' : 'en'),
  );
  useEffect(() => {
    document.documentElement.lang = language;
    savePreferences({ language });
  }, [language]);
  const value = useMemo(
    () => ({
      language,
      setLanguage,
      text: (tr: string, en: string) => (language === 'tr' ? tr : en),
    }),
    [language],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('I18nProvider is required');
  return value;
}
