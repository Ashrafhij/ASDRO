'use client';

import { useI18n } from '@/lib/i18n-context';
import { locales } from '@/lib/i18n';

const flagMap: Record<string, string> = {
  en: '🇬🇧',
  he: '🇮🇱',
  ar: '🇸🇦',
};

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
      {locales.map((l) => (
        <button
          key={l.code}
          onClick={() => setLocale(l.code)}
          className={`px-2 py-1 text-xs rounded-md font-medium transition-all duration-150 ${
            locale === l.code
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="sm:hidden">{flagMap[l.code]}</span>
          <span className="hidden sm:inline">{l.label}</span>
        </button>
      ))}
    </div>
  );
}
