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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={closePicker}>
          <div className="w-full max-w-sm bg-white rounded-t-2xl p-4 space-y-2 animate-slide-up shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-center mb-2">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-900 text-center mb-2">{np.title}</p>
            {navApps.map(({ key, labelKey, icon }) => (
              <button key={key} onClick={() => { openNavApp(key, navLocation); closePicker(); }}
                className="w-full py-3 px-4 text-sm font-medium text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors text-start flex items-center gap-3 active:scale-[0.98]">
                <span className="text-lg">{icon}</span>
                <span>{np[labelKey]}</span>
              </button>
            ))}
            <button onClick={closePicker}
              className="w-full py-3 px-4 text-sm font-medium text-gray-500 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors">
              {np.cancel}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {/* Stats bar */}
        <div className="flex items-center gap-3 text-xs bg-blue-50 rounded-xl px-4 py-3">
          <span className="flex items-center gap-1">
            <span>🛣️</span>
            <span className="font-semibold text-gray-900">{totalDistance.toFixed(1)} {rt.km}</span>
          </span>
          <span className="text-blue-200">|</span>
          <span className="flex items-center gap-1">
            <span>⏱️</span>
            <span className="text-gray-700">{totalDuration >= 60 ? `${Math.floor(totalDuration / 60)}h ${Math.round(totalDuration % 60)}m` : `${Math.round(totalDuration)} ${rt.min}`}</span>
          </span>
          <span className="text-blue-200">|</span>
          <span className="flex items-center gap-1">
            <span>📍</span>
            <span className="text-gray-700">{activeCount} active{doneCount > 0 ? `, ✅ ${doneCount} done` : ''}{skippedCount > 0 ? `, ⏭️ ${skippedCount} skipped` : ''}</span>
          </span>
        </div>

        <div className="space-y-1.5">
          {sorted.map((wp) => {
            const isComplete = completedIds.has(wp.customer.id);
            const isSkipped = skippedIds.has(wp.customer.id);

            return (
              <div key={wp.customer.id} className={`rounded-xl border px-3 py-2.5 transition-all ${
                isComplete ? 'bg-green-50 border-green-200' :
                isSkipped ? 'bg-gray-50 border-gray-200' :
                'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'
              }`}>
                <div className="flex items-start gap-2.5">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow-sm ${
                    isComplete ? 'bg-green-500' : isSkipped ? 'bg-gray-400' : 'bg-gradient-to-br from-blue-600 to-blue-500'
                  }`}>
                    {isComplete ? '✅' : isSkipped ? '⏭️' : wp.order}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium flex items-center gap-1 ${isComplete || isSkipped ? 'text-gray-500' : 'text-gray-900'}`}>
                        <span>👤</span> {wp.customer.name}
                      </span>
                      <span className="text-[10px] text-gray-400 flex items-center gap-0.5">🕐 {rt.arrival} {wp.estimatedArrival}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
                      <span>📍</span> {wp.customer.address}
                    </p>
                  </div>
                </div>
                {!isComplete && !isSkipped && (
                  <div className="flex gap-1.5 mt-2 ms-10">
                    <button onClick={() => setNavLocation(wp.customer.location)}
                      className="flex-1 px-2.5 py-1.5 bg-blue-600 text-white text-[11px] font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-1 active:scale-[0.97]">
                      🧭 {rt.navigate}
                    </button>
                    <button onClick={() => onMarkComplete(wp.customer.id)}
                      className="px-2.5 py-1.5 bg-green-600 text-white text-[11px] font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-1 active:scale-[0.97]">
                      ✅ {rt.done}
                    </button>
                    <button onClick={() => onSkip(wp.customer.id)}
                      className="px-2.5 py-1.5 bg-gray-200 text-gray-600 text-[11px] font-medium rounded-lg hover:bg-gray-300 transition-colors flex items-center justify-center gap-1 active:scale-[0.97]">
                      ⏭️ {rt.skip}
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
