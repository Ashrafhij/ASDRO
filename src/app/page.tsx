'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Customer, Location, OptimizedRoute } from '@/lib/types';
import { optimizeRoute } from '@/lib/optimizer';
import { getDriverLocation } from '@/lib/api';
import { useI18n } from '@/lib/i18n-context';
import CustomerInput from '@/components/CustomerInput';
import RouteList from '@/components/RouteList';
import LanguageSwitcher from '@/components/LanguageSwitcher';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

export default function Home() {
  const { t } = useI18n();
  const pt = t.page;
  const ht = t.header;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [driverLocation, setDriverLocation] = useState<Location | null>(null);
  const [startLocation, setStartLocation] = useState<Location | null>(null);
  const [route, setRoute] = useState<OptimizedRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [locating, setLocating] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);

  useEffect(() => {
    getDriverLocation()
      .then((loc) => {
        setDriverLocation(loc);
        setStartLocation(loc);
        setLocating(false);
      })
      .catch(() => {
        setLocating(false);
      });
  }, []);

  const optimize = useCallback(async () => {
    if (customers.length === 0) {
      setError(pt.addCustomerFirst);
      return;
    }
    if (!startLocation && !driverLocation) {
      setError(pt.setStartingLocation);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const loc = startLocation || driverLocation!;
      const result = await optimizeRoute(customers, loc);
      setRoute(result);
      setCompletedIds(new Set());
      setSkippedIds(new Set());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : pt.optimizationFailed);
    } finally {
      setLoading(false);
    }
  }, [customers, startLocation, driverLocation, pt]);

  const handleMarkComplete = useCallback(async (customerId: string) => {
    const newCompleted = new Set(completedIds);
    newCompleted.add(customerId);
    setCompletedIds(newCompleted);

    const remainingIds = new Set(customers.map(c => c.id));
    for (const id of newCompleted) remainingIds.delete(id);
    for (const id of skippedIds) remainingIds.delete(id);

    if (remainingIds.size === 0) return;

    const remainingCustomers = customers.filter(c => remainingIds.has(c.id));
    const completedCustomer = customers.find(c => c.id === customerId);
    const currentLoc = completedCustomer?.location || driverLocation;

    if (!currentLoc) return;

    try {
      const result = await optimizeRoute(remainingCustomers, currentLoc);
      setRoute(result);
    } catch {
      // keep current route
    }
  }, [customers, completedIds, skippedIds, driverLocation]);

  const handleSkip = useCallback(async (customerId: string) => {
    const newSkipped = new Set(skippedIds);
    newSkipped.add(customerId);
    setSkippedIds(newSkipped);

    const remainingIds = new Set(customers.map(c => c.id));
    for (const id of completedIds) remainingIds.delete(id);
    for (const id of newSkipped) remainingIds.delete(id);

    if (remainingIds.size === 0) return;

    const remainingCustomers = customers.filter(c => remainingIds.has(c.id));
    const loc = driverLocation;
    if (!loc) return;

    try {
      const result = await optimizeRoute(remainingCustomers, loc);
      setRoute(result);
    } catch {
      // keep current route
    }
  }, [customers, completedIds, skippedIds, driverLocation]);

  const handleClearAll = () => {
    setCustomers([]);
    setRoute(null);
    setCompletedIds(new Set());
    setSkippedIds(new Set());
    setError('');
  };

  const handleLocateMe = () => {
    setLocating(true);
    getDriverLocation()
      .then((loc) => {
        setDriverLocation(loc);
        setStartLocation(loc);
        setLocating(false);
      })
      .catch(() => {
        setError(pt.gpsError);
        setLocating(false);
      });
  };

  const getArrivalSummary = (): string => {
    if (!route || route.waypoints.length === 0) return '';
    const first = route.waypoints[0].estimatedArrival;
    const last = route.waypoints[route.waypoints.length - 1].estimatedArrival;
    return `${route.waypoints.length} ${pt.stops} · ${first} – ${last}`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <h1 className="text-lg font-bold text-gray-900">{t.app.title}</h1>
          {route && (
            <span className="hidden sm:inline text-xs text-gray-500 ms-2">
              {getArrivalSummary()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <button
            onClick={handleLocateMe}
            disabled={locating}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            {locating ? ht.locating : driverLocation ? ht.located : ht.locateMe}
          </button>
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="sm:hidden px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {showSidebar ? ht.map : ht.list}
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col sm:flex-row">
        <aside className={`${showSidebar ? 'block' : 'hidden'} sm:block w-full sm:w-96 sm:max-w-md bg-white border-b sm:border-b-0 sm:border-e border-gray-200 overflow-y-auto`}>
          <div className="p-4 space-y-4">
            <CustomerInput customers={customers} onChange={setCustomers} />

            {customers.length > 0 && !route && (
              <button
                onClick={optimize}
                disabled={loading || !startLocation}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {pt.optimizing}
                  </>
                ) : pt.optimizeRoute}
              </button>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
            )}

            {route && route.waypoints.length > 0 && (
              <>
                <RouteList
                  waypoints={route.waypoints}
                  totalDistance={route.totalDistance}
                  totalDuration={route.totalDuration}
                  completedIds={completedIds}
                  skippedIds={skippedIds}
                  onMarkComplete={handleMarkComplete}
                  onSkip={handleSkip}
                />
                <button
                  onClick={handleClearAll}
                  className="w-full px-3 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {pt.clearAll}
                </button>
              </>
            )}
          </div>
        </aside>

        <main className="flex-1 relative">
          <div className="absolute inset-0">
            <MapView
              waypoints={route?.waypoints || []}
              driverLocation={driverLocation}
              startLocation={!driverLocation ? startLocation : null}
              height="100%"
            />
          </div>
        </main>
      </div>
    </div>
  );
}
