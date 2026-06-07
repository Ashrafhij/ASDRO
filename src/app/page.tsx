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
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    getDriverLocation()
      .then((loc) => { setDriverLocation(loc); setStartLocation(loc); setLocating(false); })
      .catch(() => setLocating(false));
  }, []);

  const optimize = useCallback(async () => {
    if (customers.length === 0) { setError(pt.addCustomerFirst); return; }
    if (!startLocation && !driverLocation) { setError(pt.setStartingLocation); return; }
    setError(''); setLoading(true);
    try {
      const result = await optimizeRoute(customers, startLocation || driverLocation!);
      setRoute(result); setCompletedIds(new Set()); setSkippedIds(new Set());
    } catch { setError(pt.optimizationFailed); }
    finally { setLoading(false); }
  }, [customers, startLocation, driverLocation, pt]);

  const handleMarkComplete = useCallback(async (customerId: string) => {
    const newCompleted = new Set(completedIds); newCompleted.add(customerId);
    setCompletedIds(newCompleted);
    const remainingIds = new Set(customers.map(c => c.id));
    completedIds.forEach(id => remainingIds.delete(id));
    newCompleted.forEach(id => remainingIds.delete(id));
    skippedIds.forEach(id => remainingIds.delete(id));
    if (remainingIds.size === 0) return;
    const remaining = customers.filter(c => remainingIds.has(c.id));
    const loc = customers.find(c => c.id === customerId)?.location || driverLocation;
    if (!loc) return;
    try { setRoute(await optimizeRoute(remaining, loc)); } catch { /* ok */ }
  }, [customers, completedIds, skippedIds, driverLocation]);

  const handleSkip = useCallback(async (customerId: string) => {
    const newSkipped = new Set(skippedIds); newSkipped.add(customerId);
    setSkippedIds(newSkipped);
    const remainingIds = new Set(customers.map(c => c.id));
    completedIds.forEach(id => remainingIds.delete(id));
    skippedIds.forEach(id => remainingIds.delete(id));
    newSkipped.forEach(id => remainingIds.delete(id));
    if (remainingIds.size === 0) return;
    const remaining = customers.filter(c => remainingIds.has(c.id));
    if (!driverLocation) return;
    try { setRoute(await optimizeRoute(remaining, driverLocation)); } catch { /* ok */ }
  }, [customers, completedIds, skippedIds, driverLocation]);

  const handleClear = () => {
    setCustomers([]); setRoute(null); setCompletedIds(new Set());
    setSkippedIds(new Set()); setError('');
  };

  const handleLocate = () => {
    setLocating(true);
    getDriverLocation()
      .then((loc) => { setDriverLocation(loc); setStartLocation(loc); setLocating(false); })
      .catch(() => { setError(pt.gpsError); setLocating(false); });
  };

  const hasRoute = route && route.waypoints.length > 0;

  const sidebarContent = (
    <>
      <CustomerInput customers={customers} onChange={setCustomers} />

      {customers.length > 0 && (
        <button onClick={optimize} disabled={loading || !startLocation}
          className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl text-sm font-semibold hover:from-blue-700 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm active:scale-[0.98] flex items-center justify-center gap-2">
          {loading ? '⏳ ' + pt.optimizing : hasRoute ? '🔄 ' + pt.reoptimize : '🚀 ' + pt.optimizeRoute}
        </button>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-xl text-sm flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      )}

      {hasRoute && (
        <>
          <RouteList
            waypoints={route!.waypoints}
            totalDistance={route!.totalDistance}
            totalDuration={route!.totalDuration}
            completedIds={completedIds}
            skippedIds={skippedIds}
            onMarkComplete={handleMarkComplete}
            onSkip={handleSkip}
          />
          <button onClick={handleClear} className="w-full py-2 text-xs text-gray-500 hover:text-red-600 rounded-xl border border-gray-200 hover:border-red-200 transition-colors flex items-center justify-center gap-1.5">
            🗑️ {pt.clearAll}
          </button>
        </>
      )}
    </>
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="flex-shrink-0 bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner">
            <span className="text-base">📍</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">{t.app.title}</h1>
            <p className="text-[10px] text-blue-100/80 leading-none mt-0.5">Smart Route Optimizer</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleLocate} disabled={locating}
            className="text-xs px-3 py-1.5 rounded-xl font-medium bg-white/15 text-white hover:bg-white/25 disabled:opacity-40 transition-all backdrop-blur-sm border border-white/10 active:scale-95">
            {locating ? '📡' : driverLocation ? '✅' : '📍'} <span className="hidden sm:inline">{locating ? ht.locating : driverLocation ? ht.located : ht.locateMe}</span>
          </button>
          <LanguageSwitcher />
          <button onClick={() => setShowMap(!showMap)}
            className="lg:hidden text-xs px-3 py-1.5 rounded-xl font-medium bg-white/15 text-white hover:bg-white/25 transition-all backdrop-blur-sm border border-white/10 active:scale-95">
            {showMap ? '📋' : '🗺️'}
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className={`${showMap ? 'hidden' : 'flex'} lg:flex w-full lg:w-96 lg:flex-shrink-0 flex-col bg-white border-r border-gray-200 overflow-y-auto`}>
          <div className="p-4 space-y-4 flex-1">{sidebarContent}</div>
        </div>
        {/* Map */}
        <div className={`${showMap ? 'flex' : 'hidden'} lg:flex flex-1 relative`}>
          <MapView
            waypoints={route?.waypoints || []}
            driverLocation={driverLocation}
            startLocation={!driverLocation ? startLocation : null}
            height="100%"
          />
        </div>
      </div>
    </div>
  );
}
