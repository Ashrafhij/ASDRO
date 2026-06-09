'use client';

import { Location } from '@/lib/types';
import { useI18n } from '@/lib/i18n-context';

interface ClipboardBannerProps {
  location: Location;
  address: string;
  source: 'clipboard' | 'share';
  onAdd: (location: Location) => void;
  onDismiss: () => void;
}

export default function ClipboardBanner({ location, address, source, onAdd, onDismiss }: ClipboardBannerProps) {
  const { t, dir } = useI18n();
  const dt = t.detection;

  return (
    <div className="animate-slide-up" dir={dir}>
      <div className="bg-gradient-to-r from-blue-900/80 via-blue-800/80 to-indigo-900/80 backdrop-blur-xl border border-blue-500/30 rounded-2xl shadow-xl shadow-blue-500/10 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-blue-400">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-sm font-bold text-white">{dt.detected}</p>
            <p className="text-xs text-blue-200/80 mt-0.5 truncate">{address || `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`}</p>
            <p className="text-[10px] text-blue-300/50 mt-1">
              {source === 'clipboard' ? dt.fromClipboard : dt.fromShare}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onAdd(location)}
            className="flex-1 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-xs font-bold rounded-xl hover:from-blue-600 hover:to-indigo-600 transition-all active:scale-[0.97] shadow-lg shadow-blue-500/20">
            {dt.addStop}
          </button>
          <button onClick={onDismiss}
            className="px-5 py-2.5 bg-white/10 text-white/70 text-xs font-semibold rounded-xl hover:bg-white/20 transition-all active:scale-[0.97]">
            {dt.dismiss}
          </button>
        </div>
      </div>
    </div>
  );
}
