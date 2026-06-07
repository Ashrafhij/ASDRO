'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Locale, locales, dictionaries, Dict } from '@/lib/i18n';

interface I18nContextType {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  t: Dict;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextType | null>(null);

const STORAGE_KEY = 'asdro-locale';

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (stored && ['en', 'he', 'ar'].includes(stored)) return stored;
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, newLocale);
    }
  }, []);

  const config = locales.find(l => l.code === locale) || locales[0];
  const t = dictionaries[locale];

  useEffect(() => {
    document.documentElement.dir = config.dir;
    document.documentElement.lang = locale;
  }, [locale, config.dir]);

  return (
    <I18nContext.Provider value={{ locale, dir: config.dir, t, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
