'use client';

import { Waypoint, Customer, Location } from '@/lib/types';

interface RouteListProps {
  waypoints: Waypoint[];
  totalDistance: number;
  totalDuration: number;
  completedIds: Set<string>;
  skippedIds: Set<string>;
  onMarkComplete: (customerId: string) => void;
  onSkip: (customerId: string) => void;
}

function openNavigation(location: Location, label: string) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}&travelmode=driving`;
  window.open(url, '_blank');
}

function getStatusIcon(waypoint: Waypoint, completedIds: Set<string>, skippedIds: Set<string>) {
  if (completedIds.has(waypoint.customer.id)) return '✓';
  if (skippedIds.has(waypoint.customer.id)) return '–';
  return waypoint.order.toString();
}

function getStatusClass(waypoint: Waypoint, completedIds: Set<string>, skippedIds: Set<string>) {
  if (completedIds.has(waypoint.customer.id)) return 'bg-green-100 border-green-300 opacity-60';
  if (skippedIds.has(waypoint.customer.id)) return 'bg-gray-100 border-gray-300 opacity-60';
  return 'bg-white border-gray-200';
}

export default function RouteList({
  waypoints,
  totalDistance,
  totalDuration,
  completedIds,
  skippedIds,
  onMarkComplete,
  onSkip,
}: RouteListProps) {
  if (waypoints.length === 0) return null;

  const sorted = [...waypoints].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-3">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Total Distance</span>
            <p className="text-lg font-semibold text-gray-900">{totalDistance.toFixed(1)} km</p>
          </div>
          <div>
            <span className="text-gray-500">Est. Driving Time</span>
            <p className="text-lg font-semibold text-gray-900">
              {totalDuration >= 60
                ? `${Math.floor(totalDuration / 60)}h ${Math.round(totalDuration % 60)}m`
                : `${Math.round(totalDuration)} min`}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {sorted.map((wp) => {
          const statusIcon = getStatusIcon(wp, completedIds, skippedIds);
          const statusClass = getStatusClass(wp, completedIds, skippedIds);

          return (
            <div key={wp.customer.id} className={`border rounded-lg p-3 transition-colors ${statusClass}`}>
              <div className="flex items-start gap-3">
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white ${
                  completedIds.has(wp.customer.id) ? 'bg-green-500' :
                  skippedIds.has(wp.customer.id) ? 'bg-gray-400' : 'bg-blue-600'
                }`}>
                  {statusIcon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-gray-900 text-sm">{wp.customer.name}</h4>
                    <span className="text-xs text-gray-500">Stop {wp.order}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{wp.customer.address}</p>
                  {wp.customer.phone && (
                    <p className="text-xs text-gray-400">{wp.customer.phone}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span>Arrival: {wp.estimatedArrival}</span>
                    {wp.distanceFromPrevious > 0 && (
                      <span>{wp.distanceFromPrevious} km</span>
                    )}
                    {wp.timeFromPrevious > 0 && (
                      <span>{Math.round(wp.timeFromPrevious)} min</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-2 ml-11">
                <button
                  onClick={() => openNavigation(wp.customer.location, wp.customer.name)}
                  className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Navigate
                </button>
                {!completedIds.has(wp.customer.id) && (
                  <button
                    onClick={() => onMarkComplete(wp.customer.id)}
                    className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Done
                  </button>
                )}
                {!skippedIds.has(wp.customer.id) && !completedIds.has(wp.customer.id) && (
                  <button
                    onClick={() => onSkip(wp.customer.id)}
                    className="px-3 py-1.5 bg-gray-500 text-white text-xs font-medium rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Skip
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
