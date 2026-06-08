'use client';

import { useState, useCallback, useEffect } from 'react';
import { Waypoint, Location } from '@/lib/types';
import { useI18n } from '@/lib/i18n-context';
import type { Dict } from '@/lib/i18n';

interface RouteListProps {
  waypoints: Waypoint[];
  totalDistance: number;
  totalDuration: number;
  completedIds: Set<string>;
  skippedIds: Set<string>;
  onMarkComplete: (customerId: string) => void;
  onSkip: (customerId: string) => void;
}

type NavApp = 'google' | 'waze' | 'apple' | 'osm';

function openNavApp(app: NavApp, location: Location) {
  const latlng = location.lat + ',' + location.lng;
  const urls: Record<NavApp, string> = {
    google: 'https://www.google.com/maps/dir/?api=1&destination=' + latlng + '&travelmode=driving',
    waze: 'https://waze.com/ul?ll=' + latlng + '&navigate=yes&zoom=14',
    apple: 'https://maps.apple.com/?daddr=' + latlng + '&dirflg=d',
    osm: 'https://www.openstreetmap.org/directions?from=&to=' + latlng,
  };
  window.open(urls[app], '_blank');
}

function cleanPhone(phone: string) {
  return phone.replace(/[^0-9]/g, '');
}

function openWhatsApp(phone: string) {
  const cleaned = cleanPhone(phone);
  if (!cleaned) return;
  let number = cleaned;
  if (number.startsWith('0') && number.length === 10) {
    number = '972' + number.slice(1);
  }
  const a = document.createElement('a');
  a.href = 'https://wa.me/' + number;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.click();
}

type NavPickerKey = keyof Dict['navPicker'];
const navApps: { key: NavApp; labelKey: NavPickerKey; icon: string }[] = [
  { key: 'google', labelKey: 'googleMaps', icon: 'G' },
  { key: 'waze', labelKey: 'waze', icon: 'W' },
  { key: 'apple', labelKey: 'appleMaps', icon: 'A' },
  { key: 'osm', labelKey: 'osm', icon: 'O' },
];

const STORAGE_KEY = 'asdro-default-nav';

export default function RouteList({
  waypoints, totalDistance, totalDuration, completedIds, skippedIds, onMarkComplete, onSkip,
}: RouteListProps) {
  const { t } = useI18n();
  const np = t.navPicker;
  const rt = t.routeList;
  const [navLocation, setNavLocation] = useState<Location | null>(null);
  const [defaultNav, setDefaultNav] = useState<NavApp | null>(null);
  const [rememberChoice, setRememberChoice] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as NavApp | null;
    if (saved && navApps.some(a => a.key === saved)) setDefaultNav(saved);
  }, []);

  const closePicker = useCallback(() => { setNavLocation(null); setRememberChoice(false); }, []);

  const handleNavSelect = useCallback((app: NavApp, location: Location) => {
    if (rememberChoice) {
      localStorage.setItem(STORAGE_KEY, app);
      setDefaultNav(app);
    }
    openNavApp(app, location);
    closePicker();
  }, [rememberChoice, closePicker]);

  const clearDefault = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setDefaultNav(null);
  }, []);

  if (waypoints.length === 0) return null;

  const sorted = [...waypoints].sort((a, b) => a.order - b.order);
  const currentStop = sorted.find(w => !completedIds.has(w.customer.id) && !skippedIds.has(w.customer.id));
  const remainingStops = sorted.filter(w => w.customer.id !== currentStop?.customer.id);
  const doneCount = completedIds.size;
  const skippedCount = skippedIds.size;
  const activeCount = sorted.filter(w => !completedIds.has(w.customer.id) && !skippedIds.has(w.customer.id)).length;

  return (
    <>
      {navLocation && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={closePicker}>
          <div className="w-full max-w-sm bg-white rounded-t-3xl p-5 pb-8 space-y-2 animate-slide-up shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-center mb-2">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-900 text-center mb-2">{np.title}</p>
            {navApps.map(({ key, labelKey, icon }) => (
              <button key={key} onClick={() => handleNavSelect(key, navLocation!)}
                className="w-full py-3.5 px-4 text-sm font-medium text-gray-800 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all text-start flex items-center gap-3 active:scale-[0.98] border border-transparent hover:border-gray-200 min-h-[48px]">
                <span className="w-9 h-9 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">{icon}</span>
                <span className="flex-1">{np[labelKey]}</span>
                {defaultNav === key && <span className="text-[10px] text-blue-500 font-medium bg-blue-50 px-2 py-0.5 rounded-full">{np.setDefault}</span>}
              </button>
            ))}
            <label className="flex items-center gap-3 py-2.5 px-1 cursor-pointer">
              <input type="checkbox" checked={rememberChoice} onChange={e => setRememberChoice(e.target.checked)}
                className="w-5 h-5 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-300 cursor-pointer" />
              <span className="text-sm text-gray-600">{np.setDefault}</span>
            </label>
            <button onClick={closePicker}
              className="w-full py-3 text-sm font-medium text-gray-400 hover:text-gray-600 rounded-xl transition-colors">
              {np.cancel}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl px-3 py-3 shadow-sm">
            <p className="text-[10px] text-blue-100 font-medium uppercase tracking-wider">{rt.statDistance}</p>
            <p className="text-lg font-bold text-white mt-0.5">{totalDistance.toFixed(1)} <span className="text-sm font-normal text-blue-200">{rt.km}</span></p>
          </div>
          <div className="bg-gradient-to-br from-violet-500 to-violet-600 rounded-xl px-3 py-3 shadow-sm">
            <p className="text-[10px] text-violet-100 font-medium uppercase tracking-wider">{rt.statTime}</p>
            <p className="text-lg font-bold text-white mt-0.5">
              {totalDuration >= 60 ? Math.floor(totalDuration / 60) + 'h ' + Math.round(totalDuration % 60) + 'm' : Math.round(totalDuration) + ''}
              <span className="text-sm font-normal text-violet-200"> {totalDuration >= 60 ? '' : rt.min}</span>
            </p>
          </div>
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl px-3 py-3 shadow-sm">
            <p className="text-[10px] text-emerald-100 font-medium uppercase tracking-wider">{rt.statStops}</p>
            <p className="text-lg font-bold text-white mt-0.5">
              {activeCount}
              {doneCount > 0 && <span className="text-sm font-normal text-emerald-200"> · {doneCount}✓</span>}
              {skippedCount > 0 && <span className="text-sm font-normal text-emerald-200"> · {skippedCount}⤵</span>}
            </p>
          </div>
        </div>

        {defaultNav && (
          <button onClick={clearDefault}
            className="w-full text-[11px] text-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center gap-1 py-1">
            {rt.navigate}: {np[navApps.find(a => a.key === defaultNav)!.labelKey]} — {np.cancel}
          </button>
        )}

        {currentStop && (
          <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-5 shadow-xl shadow-blue-200/40 space-y-4">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-blue-200 font-semibold uppercase tracking-widest">{rt.nextStop}</span>
              {defaultNav && <span className="text-[10px] text-blue-300 ms-auto">{rt.navigate}: {np[navApps.find(a => a.key === defaultNav)!.labelKey]}</span>}
            </div>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-lg font-bold text-white shadow-inner flex-shrink-0">
                {currentStop.order}
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <h3 className="text-lg font-bold text-white">{currentStop.customer.name}</h3>
                <p className="text-sm text-blue-200 truncate mt-0.5">{currentStop.customer.address}</p>
                {currentStop.customer.phone && (
                  <div className="flex gap-2 mt-2">
                    <a href={'tel:' + currentStop.customer.phone}
                      className="inline-flex items-center gap-1.5 text-xs text-blue-100 bg-white/15 rounded-lg px-3 py-1.5 hover:bg-white/25 transition-colors">
                      📞 {rt.call}
                    </a>
                    <button onClick={() => openWhatsApp(currentStop.customer.phone)}
                      className="inline-flex items-center gap-1.5 text-xs text-white bg-[#25D366]/30 rounded-lg px-3 py-1.5 hover:bg-[#25D366]/40 transition-colors">
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                      {rt.whatsapp}
                    </button>
                  </div>
                )}
              </div>
              <span className="text-xs text-blue-200 bg-white/15 rounded-lg px-2.5 py-1 flex-shrink-0">🕐 {currentStop.estimatedArrival}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => {
                if (defaultNav) { openNavApp(defaultNav, currentStop.customer.location); }
                else { setNavLocation(currentStop.customer.location); }
              }}
                className="flex-1 py-3.5 bg-white text-blue-700 text-sm font-bold rounded-xl hover:bg-blue-50 transition-all active:scale-[0.97] shadow-lg min-h-[48px] flex items-center justify-center gap-2">
                🧭 {rt.navigate}
              </button>
              <button onClick={() => onMarkComplete(currentStop.customer.id)}
                className="px-6 py-3.5 bg-emerald-500 text-white text-sm font-bold rounded-xl hover:bg-emerald-600 transition-all active:scale-[0.97] shadow-lg min-h-[48px] flex items-center justify-center gap-2">
                ✓ {rt.done}
              </button>
              <button onClick={() => onSkip(currentStop.customer.id)}
                className="px-5 py-3.5 bg-white/15 text-white text-sm font-semibold rounded-xl hover:bg-white/25 transition-all active:scale-[0.97] min-h-[48px] flex items-center justify-center">
                ⤵
              </button>
            </div>
            {currentStop.customer.notes && (
              <p className="text-xs text-blue-200 bg-white/10 rounded-lg px-3 py-2">{currentStop.customer.notes}</p>
            )}
          </div>
        )}

        {remainingStops.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-gray-400 flex items-center gap-1.5 px-0.5">
              <span className="w-1 h-1 rounded-full bg-gray-300" />
              {remainingStops.length} {remainingStops.length === 1 ? rt.stop.toLowerCase() : rt.statStops.toLowerCase()}
            </p>
            {remainingStops.map((wp) => {
              const isComplete = completedIds.has(wp.customer.id);
              const isSkipped = skippedIds.has(wp.customer.id);

              return (
                <div key={wp.customer.id} className={'rounded-xl border px-4 py-3.5 transition-all ' + (
                  isComplete ? 'bg-emerald-50 border-emerald-200' :
                  isSkipped ? 'bg-gray-50 border-gray-200' :
                  'bg-white border-gray-100 hover:border-gray-200 hover:shadow-md'
                )}>
                  <div className="flex items-start gap-3">
                    <div className={'flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-sm ' + (
                      isComplete ? 'bg-emerald-500' : isSkipped ? 'bg-gray-400' : 'bg-gradient-to-br from-blue-500 to-blue-600'
                    )}>
                      {isComplete ? '✓' : isSkipped ? '–' : wp.order}
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-center justify-between">
                        <span className={'text-sm font-semibold flex items-center gap-2 ' + (isComplete || isSkipped ? 'text-gray-500' : 'text-gray-900')}>
                          {wp.customer.name}
                          {wp.customer.phone && (
                            <button onClick={(e) => { e.stopPropagation(); openWhatsApp(wp.customer.phone); }}
                              className="w-6 h-6 rounded-lg bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] flex items-center justify-center transition-colors">
                              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                            </button>
                          )}
                        </span>
                        <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md font-medium">{rt.arrival} {wp.estimatedArrival}</span>
                      </div>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{wp.customer.address}</p>
                    </div>
                  </div>
                  {!isComplete && !isSkipped && (
                    <div className="flex gap-2 mt-3 ms-12">
                      <button onClick={() => {
                        if (defaultNav) { openNavApp(defaultNav, wp.customer.location); }
                        else { setNavLocation(wp.customer.location); }
                      }}
                        className="flex-1 py-3 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-all active:scale-[0.97] shadow-sm min-h-[44px] flex items-center justify-center gap-1.5">
                        🧭 {rt.navigate}
                      </button>
                      <button onClick={() => onMarkComplete(wp.customer.id)}
                        className="px-5 py-3 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 transition-all active:scale-[0.97] shadow-sm min-h-[44px] flex items-center gap-1.5">
                        ✓ {rt.done}
                      </button>
                      <button onClick={() => onSkip(wp.customer.id)}
                        className="px-4 py-3 bg-gray-100 text-gray-600 text-xs font-semibold rounded-xl hover:bg-gray-200 transition-all active:scale-[0.97] min-h-[44px] flex items-center gap-1.5">
                        ⤵
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
