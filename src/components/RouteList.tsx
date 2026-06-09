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
  onUndoComplete: (customerId: string) => void;
  onSkip: (customerId: string) => void;
  onUnskip: (customerId: string) => void;
  onNavigateInApp: () => void;
}

type NavApp = 'google' | 'waze' | 'apple' | 'osm' | 'app';

function openNavApp(app: NavApp, location: Location) {
  if (app === 'app') return;
  const latlng = location.lat + ',' + location.lng;
  const urls: Record<NavApp, string> = {
    google: 'https://www.google.com/maps/dir/?api=1&destination=' + latlng + '&travelmode=driving',
    waze: 'https://waze.com/ul?ll=' + latlng + '&navigate=yes&zoom=14',
    apple: 'https://maps.apple.com/?daddr=' + latlng + '&dirflg=d',
    osm: 'https://www.openstreetmap.org/directions?from=&to=' + latlng,
    app: '',
  };
  window.open(urls[app], '_blank');
}

type NavPickerKey = keyof Dict['navPicker'];
const navApps: { key: NavApp; labelKey: NavPickerKey; icon: string }[] = [
  { key: 'google', labelKey: 'googleMaps', icon: 'G' },
  { key: 'waze', labelKey: 'waze', icon: 'W' },
  { key: 'apple', labelKey: 'appleMaps', icon: 'A' },
  { key: 'osm', labelKey: 'osm', icon: 'O' },
  { key: 'app', labelKey: 'inApp', icon: '📍' },
];

const STORAGE_KEY = 'asdro-default-nav';

function stopName(wp: Waypoint) {
  return wp.customer.name || wp.customer.address || `Stop ${wp.order}`;
}

export default function RouteList({
  waypoints, totalDistance, totalDuration, completedIds, skippedIds, onMarkComplete, onUndoComplete, onSkip, onUnskip, onNavigateInApp,
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
    if (app === 'app') {
      onNavigateInApp();
      closePicker();
      return;
    }
    if (rememberChoice) {
      localStorage.setItem(STORAGE_KEY, app);
      setDefaultNav(app);
    }
    openNavApp(app, location);
    closePicker();
  }, [rememberChoice, closePicker, onNavigateInApp]);

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
      {/* Nav picker bottom sheet */}
      {navLocation && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={closePicker}>
          <div className="w-full max-w-sm bg-gray-800 rounded-t-3xl p-5 pb-8 space-y-2 animate-slide-up shadow-2xl border border-gray-700/50" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-center mb-2">
              <div className="w-10 h-1 rounded-full bg-gray-600" />
            </div>
            <p className="text-sm font-semibold text-gray-100 text-center mb-2">{np.title}</p>
            {navApps.map(({ key, labelKey, icon }) => (
              <button key={key} onClick={() => handleNavSelect(key, navLocation!)}
                className="w-full py-3.5 px-4 text-sm font-medium text-gray-200 bg-gray-700/50 hover:bg-gray-700 rounded-xl transition-all text-start flex items-center gap-3 active:scale-[0.98] border border-transparent hover:border-gray-600/50 min-h-[48px]">
                <span className="w-9 h-9 rounded-xl bg-gray-700 shadow-sm border border-gray-600/50 flex items-center justify-center text-xs font-bold text-gray-300 flex-shrink-0">{icon}</span>
                <span className="flex-1">{np[labelKey]}</span>
                {defaultNav === key && <span className="text-[10px] text-blue-300 font-medium bg-blue-500/20 px-2 py-0.5 rounded-full">{np.setDefault}</span>}
              </button>
            ))}
            <label className="flex items-center gap-3 py-2.5 px-1 cursor-pointer">
              <input type="checkbox" checked={rememberChoice} onChange={e => setRememberChoice(e.target.checked)}
                className="w-5 h-5 rounded-lg border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500/30 cursor-pointer" />
              <span className="text-sm text-gray-300">{np.setDefault}</span>
            </label>
            <button onClick={closePicker}
              className="w-full py-3 text-sm font-medium text-gray-500 hover:text-gray-300 rounded-xl transition-colors">
              {np.cancel}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Stats bar */}
        <div className="flex items-stretch bg-gray-800/50 rounded-2xl border border-gray-700/50 divide-x divide-gray-700/50 overflow-hidden">
          <div className="flex-1 flex flex-col items-center justify-center py-3 px-2">
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-0.5">{rt.stops}</p>
            <p className="text-lg font-bold text-gray-100 leading-tight">
              {activeCount}
              {doneCount > 0 && <span className="text-xs font-medium text-emerald-400 ml-1">·{doneCount}✓</span>}
              {skippedCount > 0 && <span className="text-xs font-medium text-gray-500 ml-1">·{skippedCount}⤵</span>}
            </p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center py-3 px-2">
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-0.5">{rt.totalDistance}</p>
            <p className="text-lg font-bold text-gray-100 leading-tight">{totalDistance.toFixed(1)} <span className="text-xs font-medium text-gray-500">{rt.km}</span></p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center py-3 px-2">
            <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-0.5">{rt.totalTime}</p>
            <p className="text-lg font-bold text-gray-100 leading-tight">
              {totalDuration >= 60 ? `${Math.floor(totalDuration / 60)}h ${Math.round(totalDuration % 60)}m` : `${Math.round(totalDuration)}`}
              <span className="text-xs font-medium text-gray-500"> {totalDuration >= 60 ? '' : rt.min}</span>
            </p>
          </div>
        </div>

        {/* Default nav indicator */}
        {defaultNav && (
          <button onClick={clearDefault}
            className="w-full text-[11px] text-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center gap-1">
            {rt.navigate}: {np[navApps.find(a => a.key === defaultNav)!.labelKey]} — tap to change
          </button>
        )}

        {/* Next stop card */}
        {currentStop && (
          <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl overflow-hidden border border-gray-700/50">
            <div className="px-4 pt-4 pb-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-[10px] text-blue-300 font-semibold uppercase tracking-widest">{rt.nextStop}</span>
                </div>
                <span className="ml-auto text-[11px] text-gray-500 font-medium bg-white/5 rounded-full px-2.5 py-0.5">{currentStop.estimatedArrival}</span>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-xl font-bold text-white shadow-lg shadow-blue-500/30 flex-shrink-0">
                  {currentStop.order}
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <p className="text-sm text-gray-400 truncate">{currentStop.customer.address}</p>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => {
                  if (defaultNav) { openNavApp(defaultNav, currentStop.customer.location); }
                  else { setNavLocation(currentStop.customer.location); }
                }}
                  className="flex-1 py-3 bg-white text-gray-900 text-sm font-bold rounded-xl hover:bg-gray-100 transition-all active:scale-[0.97] min-h-[48px] flex items-center justify-center gap-2">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-gray-700"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                  {rt.navigate}
                </button>
                <button onClick={() => onMarkComplete(currentStop.customer.id)}
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-sm font-bold rounded-xl hover:from-emerald-600 hover:to-emerald-700 transition-all active:scale-[0.97] shadow-lg shadow-emerald-500/20 min-h-[48px] flex items-center justify-center gap-1.5">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  {rt.done}
                </button>
                <button onClick={() => onSkip(currentStop.customer.id)}
                  className="px-4 py-3 bg-white/10 text-gray-400 text-sm font-semibold rounded-xl hover:bg-white/20 transition-all active:scale-[0.97] min-h-[48px] flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Remaining stops */}
        {remainingStops.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-0.5 mb-2">
              <div className="h-px flex-1 bg-gradient-to-r from-gray-700/50 to-transparent" />
              <span className="text-[11px] font-medium text-gray-500 tracking-wide">
                {remainingStops.length} {remainingStops.length === 1 ? 'stop' : 'stops'}
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-gray-700/50 to-transparent" />
            </div>

            {remainingStops.map((wp) => {
              const isDone = completedIds.has(wp.customer.id);
              const isSkipped = skippedIds.has(wp.customer.id);
              const itemState = isDone ? 'done' : isSkipped ? 'skipped' : 'active';

              return (
                <div key={wp.customer.id} className={`rounded-xl border transition-all ${
                  itemState === 'done' ? 'bg-emerald-900/20 border-emerald-700/30' :
                  itemState === 'skipped' ? 'bg-gray-800/30 border-gray-700/30' :
                  'bg-gray-800/50 border-gray-700/30 hover:border-gray-600/30'
                }`}>
                  <div className="px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white transition-all ${
                        itemState === 'done' ? 'bg-emerald-500' :
                        itemState === 'skipped' ? 'bg-gray-400' :
                        'bg-gradient-to-br from-blue-500 to-blue-600'
                      }`}>
                        {itemState === 'done' ? (
                          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                        ) : itemState === 'skipped' ? (
                          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                        ) : wp.order}
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm font-semibold truncate ${
                            itemState === 'done' ? 'text-emerald-300' :
                            itemState === 'skipped' ? 'text-gray-500' :
                            'text-gray-100'
                          }`}>
                            {stopName(wp)}
                          </span>
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md flex-shrink-0 ${
                            itemState === 'done' ? 'bg-emerald-900/40 text-emerald-300' :
                            itemState === 'skipped' ? 'bg-gray-700/50 text-gray-400' :
                            'bg-gray-700/50 text-gray-300'
                          }`}>
                            {itemState === 'done' ? rt.done : wp.estimatedArrival}
                          </span>
                        </div>
                        {wp.customer.address && <p className="text-xs text-gray-500 truncate mt-0.5">{wp.customer.address}</p>}
                      </div>
                    </div>

                    {itemState === 'skipped' && (
                      <div className="flex gap-1.5 mt-3 ml-12">
                        <button onClick={() => onUnskip(wp.customer.id)}
                          className="flex-1 py-2.5 bg-gray-700/60 text-gray-300 text-[11px] font-semibold rounded-lg hover:bg-gray-700 transition-all active:scale-[0.97] min-h-[36px] flex items-center justify-center gap-1.5">
                          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
                          Undo skip
                        </button>
                      </div>
                    )}

                    {itemState === 'done' && (
                      <div className="flex gap-1.5 mt-3 ml-12">
                        <button onClick={() => onUndoComplete(wp.customer.id)}
                          className="flex-1 py-2.5 bg-emerald-700/40 text-emerald-300 text-[11px] font-semibold rounded-lg hover:bg-emerald-700/60 transition-all active:scale-[0.97] min-h-[36px] flex items-center justify-center gap-1.5">
                          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
                          Undo done
                        </button>
                      </div>
                    )}

                    {itemState === 'active' && (
                      <div className="flex gap-1.5 mt-3 ml-12">
                        <button onClick={() => {
                          if (defaultNav) { openNavApp(defaultNav, wp.customer.location); }
                          else { setNavLocation(wp.customer.location); }
                        }}
                          className="flex-1 py-2.5 bg-blue-600 text-white text-[11px] font-semibold rounded-lg hover:bg-blue-700 transition-all active:scale-[0.97] min-h-[36px] flex items-center justify-center gap-1">
                          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                          {rt.navigate}
                        </button>
                        <button onClick={() => onMarkComplete(wp.customer.id)}
                          className="px-4 py-2.5 bg-emerald-600 text-white text-[11px] font-semibold rounded-lg hover:bg-emerald-700 transition-all active:scale-[0.97] min-h-[36px] flex items-center gap-1">
                          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                          {rt.done}
                        </button>
                        <button onClick={() => onSkip(wp.customer.id)}
                          className="px-3 py-2.5 bg-gray-100 text-gray-500 text-[11px] font-semibold rounded-lg hover:bg-gray-200 transition-all active:scale-[0.97] min-h-[36px] flex items-center">
                          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
