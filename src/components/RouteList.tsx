'use client';

import { useState, useCallback } from 'react';
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
  const latlng = `${location.lat},${location.lng}`;
  switch (app) {
    case 'google':
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${latlng}&travelmode=driving`, '_blank');
      break;
    case 'waze':
      window.open(`https://waze.com/ul?ll=${latlng}&navigate=yes&zoom=14`, '_blank');
      break;
    case 'apple':
      window.open(`https://maps.apple.com/?daddr=${latlng}&dirflg=d`, '_blank');
      break;
    case 'osm':
      window.open(`https://www.openstreetmap.org/directions?from=&to=${latlng}`, '_blank');
      break;
  }
}

type NavPickerKey = keyof Dict['navPicker'];
const navApps: { key: NavApp; labelKey: NavPickerKey; icon: string }[] = [
  { key: 'google', labelKey: 'googleMaps', icon: '🗺️' },
  { key: 'waze', labelKey: 'waze', icon: '🧭' },
  { key: 'apple', labelKey: 'appleMaps', icon: '🍎' },
  { key: 'osm', labelKey: 'osm', icon: '🌍' },
];

export default function RouteList({
  waypoints, totalDistance, totalDuration, completedIds, skippedIds, onMarkComplete, onSkip,
}: RouteListProps) {
  const { t } = useI18n();
  const np = t.navPicker;
  const rt = t.routeList;
  const [navLocation, setNavLocation] = useState<Location | null>(null);

  const closePicker = useCallback(() => setNavLocation(null), []);

  if (waypoints.length === 0) return null;

  const sorted = [...waypoints].sort((a, b) => a.order - b.order);
  const activeCount = sorted.filter(w => !completedIds.has(w.customer.id) && !skippedIds.has(w.customer.id)).length;
  const doneCount = completedIds.size;
  const skippedCount = skippedIds.size;

  return (
    <>
      {/* Nav picker bottom sheet */}
      {navLocation && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={closePicker}>
          <div className="w-full max-w-sm bg-white rounded-t-3xl p-5 pb-8 space-y-2 animate-slide-up shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-center mb-3">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-900 text-center mb-3">{np.title}</p>
            {navApps.map(({ key, labelKey, icon }) => (
              <button key={key} onClick={() => { openNavApp(key, navLocation); closePicker(); }}
                className="w-full py-3 px-4 text-sm font-medium text-gray-800 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all text-start flex items-center gap-3 active:scale-[0.98] border border-transparent hover:border-gray-200">
                <span className="w-9 h-9 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-lg">{icon}</span>
                <span>{np[labelKey]}</span>
              </button>
            ))}
            <button onClick={closePicker}
              className="w-full py-3 px-4 text-sm font-medium text-gray-400 hover:text-gray-600 bg-transparent hover:bg-gray-50 rounded-xl transition-colors">
              {np.cancel}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {/* Stats cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl px-3 py-2.5 shadow-sm">
            <p className="text-[10px] text-blue-100 font-medium uppercase tracking-wider">Distance</p>
            <p className="text-lg font-bold text-white mt-0.5">{totalDistance.toFixed(1)} <span className="text-sm font-normal text-blue-200">{rt.km}</span></p>
          </div>
          <div className="bg-gradient-to-br from-violet-500 to-violet-600 rounded-xl px-3 py-2.5 shadow-sm">
            <p className="text-[10px] text-violet-100 font-medium uppercase tracking-wider">Time</p>
            <p className="text-lg font-bold text-white mt-0.5">
              {totalDuration >= 60 ? `${Math.floor(totalDuration / 60)}h ${Math.round(totalDuration % 60)}m` : `${Math.round(totalDuration)}`}
              <span className="text-sm font-normal text-violet-200"> {totalDuration >= 60 ? '' : rt.min}</span>
            </p>
          </div>
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl px-3 py-2.5 shadow-sm">
            <p className="text-[10px] text-emerald-100 font-medium uppercase tracking-wider">Stops</p>
            <p className="text-lg font-bold text-white mt-0.5">
              {activeCount}
              {doneCount > 0 && <span className="text-sm font-normal text-emerald-200"> · {doneCount}✓</span>}
              {skippedCount > 0 && <span className="text-sm font-normal text-emerald-200"> · {skippedCount}⤵</span>}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          {sorted.map((wp) => {
            const isComplete = completedIds.has(wp.customer.id);
            const isSkipped = skippedIds.has(wp.customer.id);

            return (
              <div key={wp.customer.id} className={`rounded-xl border px-3.5 py-3 transition-all ${
                isComplete ? 'bg-emerald-50 border-emerald-200' :
                isSkipped ? 'bg-gray-50 border-gray-200' :
                'bg-white border-gray-100 hover:border-gray-200 hover:shadow-md active:shadow-sm'
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-sm ${
                    isComplete ? 'bg-emerald-500' : isSkipped ? 'bg-gray-400' : 'bg-gradient-to-br from-blue-500 to-blue-600'
                  }`}>
                    {isComplete ? '✓' : isSkipped ? '–' : wp.order}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold ${isComplete || isSkipped ? 'text-gray-500' : 'text-gray-900'}`}>
                        {wp.customer.name}
                      </span>
                      <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md font-medium">{rt.arrival} {wp.estimatedArrival}</span>
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{wp.customer.address}</p>
                  </div>
                </div>
                {!isComplete && !isSkipped && (
                  <div className="flex gap-2 mt-3 ms-12">
                    <button onClick={() => setNavLocation(wp.customer.location)}
                      className="flex-1 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-all active:scale-[0.97] shadow-sm flex items-center justify-center gap-1.5">
                      🧭 {rt.navigate}
                    </button>
                    <button onClick={() => onMarkComplete(wp.customer.id)}
                      className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 transition-all active:scale-[0.97] shadow-sm flex items-center gap-1.5">
                      ✅ {rt.done}
                    </button>
                    <button onClick={() => onSkip(wp.customer.id)}
                      className="px-4 py-2 bg-gray-100 text-gray-600 text-xs font-semibold rounded-xl hover:bg-gray-200 transition-all active:scale-[0.97] flex items-center gap-1.5">
                      ⏭
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
