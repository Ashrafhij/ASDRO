'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Customer, Location, OptimizedRoute } from '@/lib/types';
import { optimizeRoute } from '@/lib/optimizer';
import { getDriverLocation, watchDriverLocation } from '@/lib/api';
import { useI18n } from '@/lib/i18n-context';
import CustomerInput from '@/components/CustomerInput';
import RouteList from '@/components/RouteList';
import LanguageSwitcher from '@/components/LanguageSwitcher';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

export default function Home() {
  const { t, locale, dir } = useI18n();
  const pt = t.page;
  const ht = t.header;

  const load = <T,>(key: string, fallback: T): T => {
    if (typeof window === 'undefined') return fallback;
    try { const v = localStorage.getItem('asdro-' + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  };
  const save = (key: string, val: unknown) => {
    try { localStorage.setItem('asdro-' + key, JSON.stringify(val)); } catch { /* ignore */ }
  };

  const [customers, setCustomers] = useState<Customer[]>(() => load('customers', []));
  const [driverLocation, setDriverLocation] = useState<Location | null>(null);
  const [startLocation, setStartLocation] = useState<Location | null>(null);
  const [route, setRoute] = useState<OptimizedRoute | null>(() => load('route', null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set(load<string[]>('completed', [])));
  const [skippedIds, setSkippedIds] = useState<Set<string>>(() => new Set(load<string[]>('skipped', [])));
  const [locating, setLocating] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const [inAppNav, setInAppNav] = useState(false);
  const hasRoute = route && route.waypoints.length > 0;
  const sortedWps = hasRoute ? [...route!.waypoints].sort((a, b) => a.order - b.order) : [];
  const activeWaypoint = sortedWps.find(w => !completedIds.has(w.customer.id) && !skippedIds.has(w.customer.id));
  const navRemaining = activeWaypoint ? sortedWps.slice(sortedWps.indexOf(activeWaypoint)) : [];
  const navRemainingDist = navRemaining.reduce((s, w) => s + w.distanceFromPrevious, 0);
  const navRemainingTime = navRemaining.reduce((s, w) => s + w.timeFromPrevious, 0);
  const [section, setSection] = useState<'route' | 'customers'>('route');

  useEffect(() => { save('customers', customers); }, [customers]);
  useEffect(() => { save('route', route); }, [route]);
  useEffect(() => { save('completed', [...completedIds]); }, [completedIds]);
  useEffect(() => { save('skipped', [...skippedIds]); }, [skippedIds]);

  useEffect(() => {
    if (hasRoute) setSection('route');
  }, [hasRoute]);

  useEffect(() => {
    getDriverLocation()
      .then((loc) => { setDriverLocation(loc); setStartLocation(loc); setLocating(false); })
      .catch(() => setLocating(false));
    const stopWatching = watchDriverLocation(
      (loc) => setDriverLocation(loc),
      () => {}
    );
    return stopWatching;
  }, []);

  const optimize = useCallback(async () => {
    if (customers.length === 0) { setError(pt.addCustomerFirst); return; }
    if (!startLocation && !driverLocation) { setError(pt.setStartingLocation); return; }
    setError(''); setLoading(true);
    try {
      const result = await optimizeRoute(customers, startLocation || driverLocation!, locale);
      setRoute(result); setSection('route');
    } catch { setError(pt.optimizationFailed); }
    finally { setLoading(false); }
  }, [customers, startLocation, driverLocation, locale, pt]);

  // Proximity auto-complete: when driver is within 50m of the next stop, mark it done
  useEffect(() => {
    if (!driverLocation || !route) return;
    const sorted = [...route.waypoints].sort((a, b) => a.order - b.order);
    const nextStop = sorted.find(w => !completedIds.has(w.customer.id) && !skippedIds.has(w.customer.id));
    if (!nextStop) return;
    const R = 6371000;
    const dLat = (nextStop.customer.location.lat - driverLocation.lat) * Math.PI / 180;
    const dLng = (nextStop.customer.location.lng - driverLocation.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(driverLocation.lat * Math.PI / 180) * Math.cos(nextStop.customer.location.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    if (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) < 50) {
      setCompletedIds(prev => { const n = new Set(prev); n.add(nextStop.customer.id); return n; });
    }
  }, [driverLocation, route, completedIds, skippedIds]);

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
    try { setRoute(await optimizeRoute(remaining, loc, locale)); } catch { /* ok */ }
  }, [customers, completedIds, skippedIds, driverLocation, locale]);

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
    try { setRoute(await optimizeRoute(remaining, driverLocation, locale)); } catch { /* ok */ }
  }, [customers, completedIds, skippedIds, driverLocation, locale]);

  const handleClear = () => {
    setCustomers([]); setRoute(null); setCompletedIds(new Set());
    setSkippedIds(new Set()); setError(''); setInAppNav(false);
  };

  const handleInAppNav = () => { setInAppNav(true); setShowMap(true); };

  const handleLocate = () => {
    setLocating(true);
    getDriverLocation()
      .then((loc) => { setDriverLocation(loc); setStartLocation(loc); setLocating(false); })
      .catch(() => { setError(pt.gpsError); setLocating(false); });
  };

  const routeContent = hasRoute && (
    <>
      <RouteList
        waypoints={route!.waypoints}
        totalDistance={route!.totalDistance}
        totalDuration={route!.totalDuration}
        completedIds={completedIds}
        skippedIds={skippedIds}
        onMarkComplete={handleMarkComplete}
        onSkip={handleSkip}
        onNavigateInApp={handleInAppNav}
      />
      <button onClick={handleClear}
        className="w-full py-2.5 text-xs text-gray-400 hover:text-red-500 rounded-xl border border-dashed border-gray-200 hover:border-red-200 transition-all flex items-center justify-center gap-1.5 hover:bg-red-50/50">
        🗑️ {pt.clearAll}
      </button>
    </>
  );

  const sidebarContent = (
    <>
      {hasRoute && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <button onClick={() => setSection(section === 'route' ? 'customers' : 'route')}
            className="w-full px-4 py-3.5 flex items-center justify-between text-sm hover:bg-gray-50 transition-colors">
            <span className="flex items-center gap-2.5">
              <span className={'w-2 h-2 rounded-full ' + (section === 'route' ? 'bg-blue-500' : 'bg-gray-300')} />
              <span className="font-semibold text-gray-800">{pt.route}</span>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">{route!.waypoints.length}</span>
            </span>
            <svg className={'w-4 h-4 text-gray-400 transition-transform duration-200 ' + (section === 'route' ? 'rotate-180' : '')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div className={'overflow-hidden transition-all duration-300 ' + (section === 'route' ? 'max-h-[2000px]' : 'max-h-0')}>
            <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-3">
              {routeContent}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      )}

      {hasRoute ? (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <button onClick={() => setSection(section === 'customers' ? 'route' : 'customers')}
            className="w-full px-4 py-3.5 flex items-center justify-between text-sm hover:bg-gray-50 transition-colors">
            <span className="flex items-center gap-2.5">
              <span className={'w-2 h-2 rounded-full ' + (section === 'customers' ? 'bg-blue-500' : 'bg-gray-300')} />
              <span className="font-semibold text-gray-800">{pt.customers}</span>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">{customers.length}</span>
            </span>
            <svg className={'w-4 h-4 text-gray-400 transition-transform duration-200 ' + (section === 'customers' ? 'rotate-180' : '')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div className={'overflow-hidden transition-all duration-300 ' + (section === 'customers' ? 'max-h-[2000px]' : 'max-h-0')}>
            <div className="px-4 pb-4 border-t border-gray-50 pt-3">
              <CustomerInput customers={customers} onChange={setCustomers} />
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <CustomerInput customers={customers} onChange={setCustomers} />
        </div>
      )}

      {customers.length > 0 && (
        <button onClick={optimize} disabled={loading || !startLocation}
          className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl text-sm font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-200 active:scale-[0.98] flex items-center justify-center gap-2.5">
          {loading ? (
            <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {pt.optimizing}</span>
          ) : (
            <><span className="text-base">{hasRoute ? '🔄' : '🚀'}</span> {hasRoute ? pt.reoptimize : pt.optimizeRoute}</>
          )}
        </button>
      )}
    </>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 lg:h-screen scroll-smooth">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner">
            <svg viewBox="0 0 32 32" fill="none" className="w-5 h-5">
              <path d="M16 3C11.5 3 8 6.5 8 11c0 6 8 18 8 18s8-12 8-18c0-4.5-3.5-8-8-8z" fill="white" opacity="0.95"/>
              <circle cx="16" cy="11" r="3.5" fill="#2563eb"/>
              <circle cx="11" cy="8" r="1.8" fill="#10b981"/>
              <circle cx="20" cy="7" r="1.5" fill="#f59e0b"/>
              <path d="M13 13.5l3 2 4-1.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">{t.app.title}</h1>
            <p className="text-[10px] text-blue-100/80 leading-none mt-0.5">Smart Route Optimizer</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleLocate} disabled={locating}
            className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all backdrop-blur-sm border active:scale-95 disabled:opacity-40 ${
              driverLocation
                ? 'bg-emerald-400/25 text-emerald-100 border-emerald-300/30 hover:bg-emerald-400/35'
                : 'bg-white/15 text-white border-white/10 hover:bg-white/25'
            }`}>
            {locating ? '📡' : driverLocation ? '✅' : '📍'} <span className="hidden sm:inline">{locating ? ht.locating : driverLocation ? ht.located : ht.locateMe}</span>
          </button>
          <LanguageSwitcher />
        </div>
      </header>

      {/* === Full-screen Navigation Mode (Google Maps style) === */}
      {inAppNav && activeWaypoint ? (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="h-screen w-full">
            <MapView
              waypoints={route?.waypoints || []}
              driverLocation={driverLocation}
              startLocation={!driverLocation ? startLocation : null}
              height="100%"
              followDriver
            />
          </div>

          <div className="absolute top-4 left-4 right-4 z-[1000]">
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/40 p-4" dir={dir}>
              {activeWaypoint.nextInstruction && (
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-200/50 flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white" style={{ transform: dir === 'rtl' ? 'scaleX(-1)' : 'none' }}>
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-gray-900 leading-snug">{activeWaypoint.nextInstruction}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-sm font-semibold text-gray-700 truncate">{activeWaypoint.customer.name}</span>
                      <span className="text-gray-300">·</span>
                      <span className="text-xs text-gray-500 truncate">{activeWaypoint.customer.address}</span>
                    </div>
                  </div>
                </div>
              )}
              {!activeWaypoint.nextInstruction && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200/50 flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-base font-bold text-gray-900">{activeWaypoint.customer.name}</p>
                    <p className="text-xs text-gray-500">{activeWaypoint.customer.address}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom: ETA, distance, stops, Exit */}
          <div className="absolute bottom-6 left-4 right-4 z-[1000]">
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/40 p-4 space-y-3" dir={dir}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-3xl font-bold text-gray-900">{Math.round(navRemainingTime)} min</p>
                  <p className="text-sm text-gray-500 mt-0.5">{navRemainingDist.toFixed(1)} km · {navRemaining.length} {navRemaining.length === 1 ? 'stop' : 'stops'} remaining</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-gray-800">{activeWaypoint.estimatedArrival}</p>
                  <p className="text-xs text-gray-400">est. arrival</p>
                </div>
              </div>

              {/* Progress bar */}
              {route && (
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: Math.min(100, (completedIds.size / (sortedWps.length || 1)) * 100) + '%' }} />
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => setInAppNav(false)}
                  className="flex-1 py-3 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-100/80 transition-all active:scale-[0.98]">
                  Exit Navigation
                </button>
                <button onClick={() => {
                  if (activeWaypoint) {
                    const navApp = (localStorage.getItem('asdro-default-nav') || 'google') as string;
                    const urls: Record<string, string> = {
                      google: 'https://www.google.com/maps/dir/?api=1&destination=' + activeWaypoint.customer.location.lat + ',' + activeWaypoint.customer.location.lng + '&travelmode=driving',
                      waze: 'https://waze.com/ul?ll=' + activeWaypoint.customer.location.lat + ',' + activeWaypoint.customer.location.lng + '&navigate=yes&zoom=14',
                    };
                    window.open(urls[navApp] || urls.google, '_blank');
                  }
                }}
                  className="px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-200/40 hover:from-blue-700 hover:to-indigo-700 transition-all active:scale-[0.98] flex items-center gap-2">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                  Open in Maps
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Mobile content */}
          <div className="lg:hidden">
            {showMap ? (
              <div className="sticky top-[57px] h-[calc(100vh-57px)]">
                <MapView
                  waypoints={route?.waypoints || []}
                  driverLocation={driverLocation}
                  startLocation={!driverLocation ? startLocation : null}
                  height="100%"
                />
              </div>
            ) : (
              <div className="p-5 pb-24 space-y-5 min-h-[calc(100vh-57px)]">
                {sidebarContent}
              </div>
            )}
          </div>

          {/* Desktop content */}
          <div className="hidden lg:flex flex-1 overflow-hidden">
            <div className="w-96 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
              <div className="p-5 space-y-5">{sidebarContent}</div>
            </div>
            <div className="flex-1 relative">
              <MapView
                waypoints={route?.waypoints || []}
                driverLocation={driverLocation}
                startLocation={!driverLocation ? startLocation : null}
                height="100%"
              />
            </div>
          </div>

          {/* Floating toggle button (mobile) */}
          <button onClick={() => setShowMap(!showMap)}
            className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-40 px-6 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl shadow-2xl shadow-blue-300/30 font-semibold text-sm flex items-center gap-2.5 border border-white/20 backdrop-blur-sm transition-all active:scale-95 hover:shadow-blue-300/50">
            {showMap ? '📋 List' : '🗺️ Map'}
          </button>
        </>
      )}
    </div>
  );
}
