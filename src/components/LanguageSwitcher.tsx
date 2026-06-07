'use client';

import { useState, useRef, useEffect } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { locales } from '@/lib/i18n';

export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const current = locales.find((l) => l.code === locale)!;
  const flags: Record<string, string> = { en: '🇬🇧', he: '🇮🇱', ar: '🇸🇦' };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className="w-9 h-9 rounded-xl text-sm flex items-center justify-center bg-white/15 hover:bg-white/25 transition-all border border-white/10 active:scale-90">
        {flags[current.code]}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-[140px] z-50 animate-fade-in">
          {locales.map((l) => (
            <button key={l.code} onClick={() => { setLocale(l.code); setOpen(false); }}
              className={`w-full px-3 py-2 text-sm flex items-center gap-2.5 transition-colors ${
                locale === l.code
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}>
              <span className="text-base">{flags[l.code]}</span>
              <span>{l.label}</span>
              {locale === l.code && <span className="ms-auto text-blue-600 text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
