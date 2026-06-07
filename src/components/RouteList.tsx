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

function openNavigation(location: Location) {
  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}&travelmode=driving`,
    '_blank'
  );
}

export default function RouteList({
  waypoints, totalDistance, totalDuration, completedIds, skippedIds, onMarkComplete, onSkip,
}: RouteListProps) {
  const { t } = useI18n();
  const rt = t.routeList;
  if (waypoints.length === 0) return null;

  const sorted = [...waypoints].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      {/* Stats card */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 text-white shadow-lg animate-fade-in">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-xs font-medium text-blue-200 uppercase tracking-wide">{rt.totalDistance}</span>
            <p className="text-2xl font-bold tracking-tight">{totalDistance.toFixed(1)} <span className="text-sm font-medium text-blue-200">{rt.km}</span></p>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium text-blue-200 uppercase tracking-wide">{rt.estDrivingTime}</span>
            <p className="text-2xl font-bold tracking-tight">
              {totalDuration >= 60
                ? `${Math.floor(totalDuration / 60)}h ${Math.round(totalDuration % 60)}m`
                : `${Math.round(totalDuration)}`}
              <span className="text-sm font-medium text-blue-200 ms-1">{rt.min}</span>
            </p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-blue-500/30 flex items-center gap-2 text-xs text-blue-200">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <span>{sorted.length} {rt.stop.toLowerCase()}{sorted.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Stop cards */}
      <div className="space-y-2">
        {sorted.map((wp) => {
          const isComplete = completedIds.has(wp.customer.id);
          const isSkipped = skippedIds.has(wp.customer.id);
          const isActive = !isComplete && !isSkipped;

          return (
            <div
              key={wp.customer.id}
              className={`group relative rounded-xl border shadow-sm transition-all duration-200 animate-slide-in ${
                isComplete
                  ? 'bg-emerald-50/80 border-emerald-200'
                  : isSkipped
                  ? 'bg-gray-50/80 border-gray-200'
                  : 'bg-white border-gray-100 hover:shadow-md hover:-translate-y-0.5'
              }`}
              style={{ animationDelay: `${wp.order * 50}ms` }}
            >
              {/* Status bar */}
              <div className={`absolute inset-y-0 start-0 w-1 rounded-s-xl transition-colors ${
                isComplete ? 'bg-emerald-500' : isSkipped ? 'bg-gray-300' : 'bg-blue-500'
              }`} />

              <div className="ps-4 pe-4 py-3.5">
                <div className="flex items-start gap-3">
                  {/* Order badge */}
                  <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shadow-sm transition-colors ${
                    isComplete
                      ? 'bg-emerald-500 text-white'
                      : isSkipped
                      ? 'bg-gray-300 text-white'
                      : 'bg-white text-blue-600 border-2 border-blue-200'
                  }`}>
                    {isComplete ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : isSkipped ? (
                      <span className="text-lg leading-none">–</span>
                    ) : (
                      wp.order
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className={`font-semibold text-sm truncate ${
                        isComplete || isSkipped ? 'text-gray-500' : 'text-gray-900'
                      }`}>
                        {wp.customer.name}
                      </h4>
                      {isActive && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse-dot" />
                          {rt.stop} {wp.order}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{wp.customer.address}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                      <span className="flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {wp.estimatedArrival}
                      </span>
                      {wp.distanceFromPrevious > 0 && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                          </svg>
                          {wp.distanceFromPrevious} {rt.km}
                        </span>
                      )}
                      {wp.timeFromPrevious > 0 && (
                        <span>{Math.round(wp.timeFromPrevious)} {rt.min}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {isActive && (
                  <div className="flex gap-1.5 mt-3 ms-12">
                    <button
                      onClick={() => openNavigation(wp.customer.location)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-xs font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-150 shadow-sm hover:shadow-md active:scale-[0.98]"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                      </svg>
                      {rt.navigate}
                    </button>
                    <button
                      onClick={() => onMarkComplete(wp.customer.id)}
                      className="px-3 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-xs font-semibold rounded-xl hover:from-emerald-600 hover:to-emerald-700 transition-all duration-150 shadow-sm hover:shadow-md active:scale-[0.98]"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onSkip(wp.customer.id)}
                      className="px-3 py-2 bg-white text-gray-500 text-xs font-medium rounded-xl border border-gray-200 hover:bg-gray-50 hover:text-gray-700 transition-all duration-150 active:scale-[0.98]"
                      title={rt.skip}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
