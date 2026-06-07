'use client';

import { useI18n } from '@/lib/i18n-context';
import { locales } from '@/lib/i18n';

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const flags: Record<string, string> = { en: '🇬🇧', he: '🇮🇱', ar: '🇸🇦' };
  return (
    <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
      {locales.map((l) => (
        <button key={l.code} onClick={() => setLocale(l.code)}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
            locale === l.code
              ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}>
          {flags[l.code]} {l.label}
        </button>
      ))}
    </div>
  );
}
