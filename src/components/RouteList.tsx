'use client';

import { Waypoint, Location } from '@/lib/types';
import { useI18n } from '@/lib/i18n-context';

interface RouteListProps {
  waypoints: Waypoint[];
  totalDistance: number;
  totalDuration: number;
  completedIds: Set<string>;
  skippedIds: Set<string>;
  onMarkComplete: (customerId: string) => void;
  onSkip: (customerId: string) => void;
}

function openNav(location: Location) {
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}&travelmode=driving`, '_blank');
}

export default function RouteList({
  waypoints, totalDistance, totalDuration, completedIds, skippedIds, onMarkComplete, onSkip,
}: RouteListProps) {
  const { t } = useI18n();
  const rt = t.routeList;
  if (waypoints.length === 0) return null;

  const sorted = [...waypoints].sort((a, b) => a.order - b.order);
  const activeCount = sorted.filter(w => !completedIds.has(w.customer.id) && !skippedIds.has(w.customer.id)).length;
  const doneCount = completedIds.size;
  const skippedCount = skippedIds.size;

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="flex items-center gap-3 text-xs text-gray-600 bg-blue-50 rounded-xl px-4 py-2.5">
        <span className="font-semibold text-gray-900">{totalDistance.toFixed(1)} {rt.km}</span>
        <span className="text-gray-300">|</span>
        <span>{totalDuration >= 60 ? `${Math.floor(totalDuration / 60)}h ${Math.round(totalDuration % 60)}m` : `${Math.round(totalDuration)} ${rt.min}`}</span>
        <span className="text-gray-300">|</span>
        <span>{activeCount} active{doneCount > 0 ? `, ${doneCount} done` : ''}{skippedCount > 0 ? `, ${skippedCount} skipped` : ''}</span>
      </div>

      <div className="space-y-1.5">
        {sorted.map((wp) => {
          const isComplete = completedIds.has(wp.customer.id);
          const isSkipped = skippedIds.has(wp.customer.id);

          return (
            <div key={wp.customer.id} className={`rounded-xl border px-3 py-2.5 transition-all ${
              isComplete ? 'bg-green-50 border-green-200' :
              isSkipped ? 'bg-gray-50 border-gray-200' :
              'bg-white border-gray-100 hover:border-gray-200'
            }`}>
              <div className="flex items-start gap-2.5">
                <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white ${
                  isComplete ? 'bg-green-500' : isSkipped ? 'bg-gray-400' : 'bg-blue-600'
                }`}>
                  {isComplete ? '✓' : isSkipped ? '–' : wp.order}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${isComplete || isSkipped ? 'text-gray-500' : 'text-gray-900'}`}>
                      {wp.customer.name}
                    </span>
                    <span className="text-[10px] text-gray-400">{rt.arrival} {wp.estimatedArrival}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{wp.customer.address}</p>
                </div>
              </div>
              {!isComplete && !isSkipped && (
                <div className="flex gap-1.5 mt-2 ms-9">
                  <button onClick={() => openNav(wp.customer.location)}
                    className="flex-1 px-2.5 py-1.5 bg-blue-600 text-white text-[11px] font-medium rounded-lg hover:bg-blue-700 transition-colors">
                    {rt.navigate}
                  </button>
                  <button onClick={() => onMarkComplete(wp.customer.id)}
                    className="px-2.5 py-1.5 bg-green-600 text-white text-[11px] font-medium rounded-lg hover:bg-green-700 transition-colors">
                    {rt.done}
                  </button>
                  <button onClick={() => onSkip(wp.customer.id)}
                    className="px-2.5 py-1.5 bg-gray-200 text-gray-600 text-[11px] font-medium rounded-lg hover:bg-gray-300 transition-colors">
                    {rt.skip}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
