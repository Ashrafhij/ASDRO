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
  onNavigateInApp?: (location: Location) => void;
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
  { key: 'app', labelKey: 'inApp', icon: '📍' },
];

const STORAGE_KEY = 'asdro-default-nav';

export default function RouteList({
  waypoints, totalDistance, totalDuration, completedIds, skippedIds, onMarkComplete, onSkip, onNavigateInApp,
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
      onNavigateInApp?.(location);
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

      <div className="space-y-5">
        {/* Stats bar */}
        <div className="flex items-stretch bg-white rounded-2xl shadow-sm border border-gray-100 divide-x divide-gray-100 overflow-hidden">
          <div className="flex-1 flex flex-col items-center justify-center py-3.5 px-2">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-0.5">{rt.statDistance}</p>
            <p className="text-lg font-bold text-gray-900 leading-tight">{totalDistance.toFixed(1)} <span className="text-xs font-medium text-gray-400">{rt.km}</span></p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center py-3.5 px-2">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-0.5">{rt.statTime}</p>
            <p className="text-lg font-bold text-gray-900 leading-tight">
              {totalDuration >= 60 ? `${Math.floor(totalDuration / 60)}h ${Math.round(totalDuration % 60)}m` : `${Math.round(totalDuration)}`}
              <span className="text-xs font-medium text-gray-400"> {totalDuration >= 60 ? '' : rt.min}</span>
            </p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center py-3.5 px-2">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-0.5">{rt.statStops}</p>
            <p className="text-lg font-bold text-gray-900 leading-tight">
              {activeCount}
              {doneCount > 0 && <span className="text-xs font-medium text-emerald-500 ml-1">· {doneCount}✓</span>}
              {skippedCount > 0 && <span className="text-xs font-medium text-gray-400 ml-1">· {skippedCount}⤵</span>}
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

        {/* Next stop — hero card */}
        {currentStop && (
          <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-xl overflow-hidden">
            <div className="px-5 pt-4 pb-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-[10px] text-blue-300 font-semibold uppercase tracking-widest">{rt.nextStop}</span>
                </div>
                <span className="ml-auto text-[11px] text-gray-500 font-medium bg-white/5 rounded-full px-2.5 py-0.5">{currentStop.estimatedArrival}</span>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-xl font-bold text-white shadow-lg shadow-blue-500/30 flex-shrink-0">
                  {currentStop.order}
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <h3 className="text-lg font-bold text-white">{currentStop.customer.name}</h3>
                  <p className="text-sm text-gray-400 truncate mt-0.5">{currentStop.customer.address}</p>
                  {currentStop.customer.phone && (
                    <div className="flex gap-2 mt-2.5">
                      <a href={'tel:' + currentStop.customer.phone}
                        className="inline-flex items-center gap-1.5 text-[11px] text-gray-300 bg-white/10 rounded-lg px-3 py-1.5 hover:bg-white/20 transition-colors">
                        📞 {rt.call}
                      </a>
                      <button onClick={() => openWhatsApp(currentStop.customer.phone)}
                        className="inline-flex items-center gap-1.5 text-[11px] text-white bg-[#25D366]/25 rounded-lg px-3 py-1.5 hover:bg-[#25D366]/35 transition-colors">
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        {rt.whatsapp}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => {
                  if (defaultNav) { openNavApp(defaultNav, currentStop.customer.location); }
                  else { setNavLocation(currentStop.customer.location); }
                }}
                  className="flex-1 py-3 bg-white text-gray-900 text-sm font-bold rounded-xl hover:bg-gray-100 transition-all active:scale-[0.97] shadow-lg shadow-white/10 min-h-[48px] flex items-center justify-center gap-2">
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

              {currentStop.customer.notes && (
                <div className="flex items-start gap-2 text-xs text-gray-400 bg-white/5 rounded-xl px-3.5 py-2.5">
                  <span className="text-gray-500 mt-0.5">📌</span>
                  <span>{currentStop.customer.notes}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Remaining stops */}
        {remainingStops.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-0.5 mb-2">
              <div className="h-px flex-1 bg-gradient-to-r from-gray-100 to-transparent" />
              <span className="text-[11px] font-medium text-gray-400 tracking-wide">
                {remainingStops.length} {remainingStops.length === 1 ? 'stop' : 'remaining'}
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-gray-100 to-transparent" />
            </div>

            {remainingStops.map((wp) => {
              const isDone = completedIds.has(wp.customer.id);
              const isSkipped = skippedIds.has(wp.customer.id);
              const itemState = isDone ? 'done' : isSkipped ? 'skipped' : 'active';

              return (
                <div key={wp.customer.id} className={`group rounded-xl border transition-all ${
                  itemState === 'done' ? 'bg-emerald-50/50 border-emerald-200/60' :
                  itemState === 'skipped' ? 'bg-gray-50 border-gray-200/60' :
                  'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'
                }`}>
                  <div className="px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-sm transition-all ${
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
                            itemState === 'done' ? 'text-emerald-800' :
                            itemState === 'skipped' ? 'text-gray-500' :
                            'text-gray-900'
                          }`}>
                            {wp.customer.name}
                          </span>
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md flex-shrink-0 ${
                            itemState === 'done' ? 'bg-emerald-100 text-emerald-600' :
                            itemState === 'skipped' ? 'bg-gray-100 text-gray-400' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {itemState === 'done' ? rt.done : wp.estimatedArrival}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 truncate mt-0.5">{wp.customer.address}</p>
                      </div>
                    </div>

                    {/* Actions row — only show for active stops */}
                    {itemState === 'active' && (
                      <div className="flex gap-1.5 mt-3 ml-12">
                        <button onClick={() => {
                          if (defaultNav) { openNavApp(defaultNav, wp.customer.location); }
                          else { setNavLocation(wp.customer.location); }
                        }}
                          className="flex-1 py-2.5 bg-blue-600 text-white text-[11px] font-semibold rounded-lg hover:bg-blue-700 transition-all active:scale-[0.97] shadow-sm min-h-[36px] flex items-center justify-center gap-1">
                          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                          {rt.navigate}
                        </button>
                        <button onClick={() => onMarkComplete(wp.customer.id)}
                          className="px-4 py-2.5 bg-emerald-600 text-white text-[11px] font-semibold rounded-lg hover:bg-emerald-700 transition-all active:scale-[0.97] shadow-sm min-h-[36px] flex items-center gap-1">
                          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                          {rt.done}
                        </button>
                        <button onClick={() => onSkip(wp.customer.id)}
                          className="px-3 py-2.5 bg-gray-100 text-gray-500 text-[11px] font-semibold rounded-lg hover:bg-gray-200 transition-all active:scale-[0.97] min-h-[36px] flex items-center">
                          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                        </button>
                        {wp.customer.phone && (
                          <button onClick={(e) => { e.stopPropagation(); openWhatsApp(wp.customer.phone); }}
                            className="px-3 py-2.5 bg-[#25D366]/15 text-[#25D366] text-[11px] font-semibold rounded-lg hover:bg-[#25D366]/25 transition-all min-h-[36px] flex items-center">
                            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Show customer notes for active and done stops */}
                    {wp.customer.notes && itemState !== 'skipped' && (
                      <p className="text-[11px] text-gray-400 mt-2 ml-12 leading-relaxed">📌 {wp.customer.notes}</p>
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
