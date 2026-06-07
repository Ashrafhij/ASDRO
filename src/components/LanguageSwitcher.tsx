'use client';

import { useI18n } from '@/lib/i18n-context';
import { locales } from '@/lib/i18n';

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const flags: Record<string, string> = { en: '🇬🇧', he: '🇮🇱', ar: '🇸🇦' };
  return (
    <div className="flex items-center gap-1">
      {locales.map((l) => (
        <button key={l.code} onClick={() => setLocale(l.code)}
          className={`w-8 h-8 rounded-xl text-sm flex items-center justify-center transition-all active:scale-90 ${
            locale === l.code
              ? 'bg-white/25 shadow-sm ring-1 ring-white/20 scale-110'
              : 'text-white/60 hover:text-white/80 hover:bg-white/10'
          }`}>
          {flags[l.code]}
        </button>
      ))}
    </div>
  );
}
