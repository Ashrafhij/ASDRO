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
        className="w-9 h-9 rounded-xl text-base flex items-center justify-center bg-white/10 hover:bg-white/20 transition-all border border-white/10 active:scale-90 shadow-sm">
        <span className="drop-shadow-sm">{flags[current.code]}</span>
      </button>
      {open && (
        <div className="absolute end-0 top-full mt-2 bg-gray-800 rounded-2xl shadow-2xl border border-gray-700/50 py-1.5 w-max min-w-[140px] z-50 animate-fade-in">
          {locales.map((l) => (
            <button key={l.code} onClick={() => { setLocale(l.code); setOpen(false); }}
              className={`relative w-full px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${
                locale === l.code
                  ? 'bg-blue-500/20 text-blue-300 font-semibold'
                  : 'text-gray-300 hover:bg-white/10'
              }`}>
              <span className="text-lg leading-none flex-shrink-0">{flags[l.code]}</span>
              <span>{l.label}</span>
              {locale === l.code && (
                <span className="ms-auto flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
