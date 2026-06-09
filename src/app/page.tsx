'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Customer, Location, OptimizedRoute } from '@/lib/types';
import { optimizeRoute } from '@/lib/optimizer';
import { getDriverLocation, watchDriverLocation } from '@/lib/api';
import { useI18n } from '@/lib/i18n-context';
import CustomerInput from '@/components/CustomerInput';
import RouteList from '@/components/RouteList';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import type { MapViewRef } from '@/components/MapView';

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
  const [recenterVisible, setRecenterVisible] = useState(false);
  const [navLocation, setNavLocation] = useState<Location | null>(null);
  const mapRef = useRef<MapViewRef>(null);
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
        className="w-full py-2.5 text-xs text-gray-500 hover:text-red-400 rounded-xl border border-dashed border-gray-700/50 hover:border-red-500/30 transition-all flex items-center justify-center gap-1.5 hover:bg-red-500/10">
        🗑️ {pt.clearAll}
      </button>
    </>
  );

  const sidebarContent = (
    <>
      {hasRoute && (
        <div className="bg-gray-800/80 rounded-2xl border border-gray-700/50 overflow-hidden shadow-sm">
          <button onClick={() => setSection(section === 'route' ? 'customers' : 'route')}
            className="w-full px-4 py-3.5 flex items-center justify-between text-sm hover:bg-white/5 transition-colors">
            <span className="flex items-center gap-2.5">
              <span className={'w-2 h-2 rounded-full ' + (section === 'route' ? 'bg-blue-400' : 'bg-gray-600')} />
              <span className="font-semibold text-gray-100">{pt.route}</span>
              <span className="text-xs text-gray-400 bg-gray-700/50 px-2 py-0.5 rounded-full font-medium">{route!.waypoints.length}</span>
            </span>
            <svg className={'w-4 h-4 text-gray-500 transition-transform duration-200 ' + (section === 'route' ? 'rotate-180' : '')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div className={'overflow-hidden transition-all duration-300 ' + (section === 'route' ? 'max-h-[2000px]' : 'max-h-0')}>
            <div className="px-4 pb-4 border-t border-gray-700/30 pt-3 space-y-3">
              {routeContent}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-500/20 text-red-400 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      )}

      {hasRoute ? (
        <div className="bg-gray-800/80 rounded-2xl border border-gray-700/50 overflow-hidden shadow-sm">
          <button onClick={() => setSection(section === 'customers' ? 'route' : 'customers')}
            className="w-full px-4 py-3.5 flex items-center justify-between text-sm hover:bg-white/5 transition-colors">
            <span className="flex items-center gap-2.5">
              <span className={'w-2 h-2 rounded-full ' + (section === 'customers' ? 'bg-blue-400' : 'bg-gray-600')} />
              <span className="font-semibold text-gray-100">{pt.customers}</span>
              <span className="text-xs text-gray-400 bg-gray-700/50 px-2 py-0.5 rounded-full font-medium">{customers.length}</span>
            </span>
            <svg className={'w-4 h-4 text-gray-500 transition-transform duration-200 ' + (section === 'customers' ? 'rotate-180' : '')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div className={'overflow-hidden transition-all duration-300 ' + (section === 'customers' ? 'max-h-[2000px]' : 'max-h-0')}>
            <div className="px-4 pb-4 border-t border-gray-700/30 pt-3">
              <CustomerInput customers={customers} onChange={setCustomers} />
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-800/80 backdrop-blur-xl rounded-2xl border border-gray-700/50 shadow-sm p-4">
          <CustomerInput customers={customers} onChange={setCustomers} />
        </div>
      )}

      {customers.length > 0 && (
        <button onClick={optimize} disabled={loading || !startLocation}
          className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl text-sm font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98] flex items-center justify-center gap-2.5">
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
    <div className="min-h-screen flex flex-col bg-gray-950 lg:h-screen scroll-smooth">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 px-4 py-3 flex items-center justify-between shadow-lg border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center shadow-inner border border-white/10">
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
            <p className="text-[10px] text-gray-400 leading-none mt-0.5">Smart Route Optimizer</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleLocate} disabled={locating}
            className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all backdrop-blur-sm border active:scale-95 disabled:opacity-40 ${
              driverLocation
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30'
                : 'bg-white/10 text-gray-300 border-white/10 hover:bg-white/20'
            }`}>
            {locating ? '📡' : driverLocation ? '✅' : '📍'} <span className="hidden sm:inline">{locating ? ht.locating : driverLocation ? ht.located : ht.locateMe}</span>
          </button>
          <LanguageSwitcher />
        </div>
      </header>

      {/* === Full-screen Navigation Mode === */}
      {inAppNav && activeWaypoint ? (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="h-screen w-full">
            <MapView
              ref={mapRef}
              waypoints={route?.waypoints || []}
              driverLocation={driverLocation}
              startLocation={!driverLocation ? startLocation : null}
              height="100%"
              followDriver
              onManualPan={() => setRecenterVisible(true)}
            />
          </div>

          {/* Re-center button */}
          {recenterVisible && driverLocation && (
            <button onClick={() => { mapRef.current?.recenter(driverLocation.lat, driverLocation.lng); setRecenterVisible(false); }}
              className="absolute bottom-72 right-4 z-[1001] w-10 h-10 bg-white/90 backdrop-blur-xl rounded-full shadow-2xl flex items-center justify-center border border-white/40 transition-all active:scale-90 hover:bg-white">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-blue-600">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
            </button>
          )}

          {/* Top instruction chip */}
          {activeWaypoint.nextInstruction && (
            <div className="absolute top-6 left-4 right-4 z-[1000] flex justify-center">
              <div className="inline-flex items-center gap-3 bg-black/50 backdrop-blur-xl rounded-full px-5 py-3 shadow-2xl border border-white/10 max-w-[90%]" dir={dir}>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white" style={{ transform: dir === 'rtl' ? 'scaleX(-1)' : 'none' }}>
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{activeWaypoint.nextInstruction}</p>
                  <p className="text-[11px] text-white/60 truncate">{activeWaypoint.customer.name} · {activeWaypoint.customer.address}</p>
                </div>
              </div>
            </div>
          )}

          {/* Bottom panel */}
          <div className="absolute bottom-6 left-4 right-4 z-[1000]">
            <div className="bg-black/60 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/10 p-5 space-y-4" dir={dir}>
              {/* Primary row — big time + ETA */}
              <div className="flex items-end justify-between gap-4">
                <div>
                  <span className="text-5xl font-bold text-white tracking-tight">{Math.round(navRemainingTime)}</span>
                  <span className="text-lg font-semibold text-white/60 ml-1">min</span>
                  <p className="text-xs text-white/40 mt-0.5">{navRemainingDist.toFixed(1)} km total</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-white">{activeWaypoint.estimatedArrival}</p>
                  <p className="text-[11px] text-white/40">estimated arrival</p>
                </div>
              </div>

              {/* Stats chips */}
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center justify-center gap-1.5 bg-white/10 rounded-xl py-2">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white/60"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                  <span className="text-xs font-semibold text-white/80">{navRemainingDist.toFixed(1)} km</span>
                </div>
                <div className="flex-1 flex items-center justify-center gap-1.5 bg-white/10 rounded-xl py-2">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white/60"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                  <span className="text-xs font-semibold text-white/80">{navRemaining.length} {navRemaining.length === 1 ? 'stop' : 'stops'}</span>
                </div>
              </div>

              {/* Progress bar */}
              {route && (
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-400 to-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: Math.min(100, (completedIds.size / (sortedWps.length || 1)) * 100) + '%' }} />
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => setInAppNav(false)}
                  className="flex-1 py-3 bg-white/10 text-white/80 text-sm font-semibold rounded-2xl hover:bg-white/20 transition-all active:scale-[0.98]">
                  Exit
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
                  className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-semibold rounded-2xl shadow-lg shadow-blue-500/30 hover:from-blue-600 hover:to-indigo-700 transition-all active:scale-[0.98]">
                  Navigate
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
            <div className="w-96 flex-shrink-0 bg-gray-900 border-r border-gray-800 overflow-y-auto">
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
            className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-40 px-6 py-3.5 bg-gray-800/90 backdrop-blur-xl text-white rounded-2xl shadow-2xl shadow-black/30 font-semibold text-sm flex items-center gap-2.5 border border-gray-700/50 transition-all active:scale-95 hover:bg-gray-700/90">
            {showMap ? '📋 List' : '🗺️ Map'}
          </button>
        </>
      )}
    </div>
  );
}
