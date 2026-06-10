'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Customer, Location, OptimizedRoute } from '@/lib/types';
import { optimizeRoute } from '@/lib/optimizer';
import { getDriverLocation, watchDriverLocation } from '@/lib/api';
import { useI18n } from '@/lib/i18n-context';
import { useClipboardDetection } from '@/lib/useClipboardDetection';
import { reverseGeocode, parseWhatsAppLocation } from '@/lib/geocoding';
import CustomerInput from '@/components/CustomerInput';
import RouteList from '@/components/RouteList';
import ClipboardBanner from '@/components/ClipboardBanner';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import type { MapViewRef } from '@/components/MapView';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

export default function Home() {
  const { t, locale, dir } = useI18n();
  const pt = t.page;
  const rt = t.routeList;

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
  const [shareLocation, setShareLocation] = useState<{ location: Location; text: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const getCollapsedTranslate = () => (typeof window !== 'undefined' ? window.innerHeight * 0.85 - 180 : 500);
  const getSnapPoints = () => {
    const h = typeof window !== 'undefined' ? window.innerHeight : 1000;
    return { full: 0, half: h * 0.35, collapsed: h * 0.85 - 180 };
  };
  const getCurrentTranslate = () => {
    if (!sheetRef.current) return getCollapsedTranslate();
    const m = sheetRef.current.style.transform.match(/translateY\(([\d.]+)px\)/);
    return m ? parseFloat(m[1]) : getCollapsedTranslate();
  };
  const snapTo = (target: number) => {
    const maxT = getMaxTranslate();
    const clamped = Math.max(0, Math.min(maxT, target));
    setSheetTranslate(clamped);
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'transform 0.3s ease-out';
      sheetRef.current.style.transform = `translateY(${clamped}px)`;
    }
  };
  const [sheetTranslate, setSheetTranslate] = useState(getCollapsedTranslate);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ startY: 0, startTranslate: 0, dragging: false, moved: false });
  const mapRef = useRef<MapViewRef>(null);
  const { detected: clipLocation, dismiss: dismissClip, showButton: showPasteButton } = useClipboardDetection();
  const hasRoute = route && route.waypoints.length > 0;
  const sortedWps = hasRoute ? [...route!.waypoints].sort((a, b) => a.order - b.order) : [];
  const activeWaypoint = sortedWps.find(w => !completedIds.has(w.customer.id) && !skippedIds.has(w.customer.id));
  const nextStopId = activeWaypoint?.customer.id || null;

  useEffect(() => { save('customers', customers); }, [customers]);
  useEffect(() => { save('route', route); }, [route]);
  useEffect(() => { save('completed', [...completedIds]); }, [completedIds]);
  useEffect(() => { save('skipped', [...skippedIds]); }, [skippedIds]);

  // Check for incoming shared location from Web Share Target
  useEffect(() => {
    const raw = sessionStorage.getItem('asdro-share-location');
    if (raw) {
      sessionStorage.removeItem('asdro-share-location');
      try { setShareLocation(JSON.parse(raw)); } catch { /* ignore */ }
    }
  }, []);

  const pendingLocation = shareLocation || clipLocation;
  const locationSource: 'clipboard' | 'share' = shareLocation ? 'share' : 'clipboard';

  const handleDetectedAdd = useCallback(async (loc: Location) => {
    const address = await reverseGeocode(loc.lat, loc.lng);
    const newCustomer: Customer = {
      id: crypto.randomUUID(), name: '', phone: '',
      location: loc, address, notes: '',
    };
    setCustomers(prev => [...prev, newCustomer]);
    setShareLocation(null);
    dismissClip();
  }, [dismissClip]);

  const [pasting, setPasting] = useState(false);
  const handleManualPaste = useCallback(async () => {
    setError(''); setPasting(true);
    try {
      const text = await navigator.clipboard.readText();
      if (!text) { setError('Clipboard is empty'); setPasting(false); return; }
      const location = parseWhatsAppLocation(text);
      if (!location) { setError('No location found in clipboard'); setPasting(false); return; }
      const address = await reverseGeocode(location.lat, location.lng);
      const newCustomer: Customer = {
        id: crypto.randomUUID(), name: '', phone: '',
        location, address, notes: '',
      };
      setCustomers(prev => [...prev, newCustomer]);
      setPasting(false);
    } catch {
      setError('Could not read clipboard. ASDRO needs HTTPS or a user gesture.');
      setPasting(false);
    }
  }, []);

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
      const result = await optimizeRoute(customers, driverLocation || startLocation!, locale);
      setRoute(result); setSheetTranslate(0);
    } catch { setError(pt.optimizationFailed); }
    finally { setLoading(false); }
  }, [customers, startLocation, driverLocation, locale, pt]);

  // Proximity auto-complete
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

  const handleUnskip = useCallback(async (customerId: string) => {
    const newSkipped = new Set(skippedIds); newSkipped.delete(customerId);
    setSkippedIds(newSkipped);
    const remainingIds = new Set(customers.map(c => c.id));
    completedIds.forEach(id => remainingIds.delete(id));
    newSkipped.forEach(id => remainingIds.delete(id));
    if (remainingIds.size === 0) return;
    const remaining = customers.filter(c => remainingIds.has(c.id));
    if (!driverLocation) return;
    try { setRoute(await optimizeRoute(remaining, driverLocation, locale)); } catch { /* ok */ }
  }, [customers, completedIds, skippedIds, driverLocation, locale]);

  const handleUndoComplete = useCallback(async (customerId: string) => {
    const newCompleted = new Set(completedIds); newCompleted.delete(customerId);
    setCompletedIds(newCompleted);
    const remainingIds = new Set(customers.map(c => c.id));
    newCompleted.forEach(id => remainingIds.delete(id));
    skippedIds.forEach(id => remainingIds.delete(id));
    if (remainingIds.size === 0) return;
    const remaining = customers.filter(c => remainingIds.has(c.id));
    if (!driverLocation) return;
    try { setRoute(await optimizeRoute(remaining, driverLocation, locale)); } catch { /* ok */ }
  }, [customers, completedIds, skippedIds, driverLocation, locale]);

  const handleClear = () => {
    setCustomers([]); setRoute(null); setCompletedIds(new Set());
    setSkippedIds(new Set()); setError('');
    setMenuOpen(false);
  };

  // Draggable bottom sheet handlers
  const getMaxTranslate = () => (typeof window !== 'undefined' ? window.innerHeight * 0.85 - 180 : 500);

  const handleSheetPointerDown = (e: React.PointerEvent) => {
    dragState.current = { startY: e.clientY, startTranslate: sheetTranslate, dragging: true, moved: false };
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleSheetPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current.dragging || !sheetRef.current) return;
    dragState.current.moved = true;
    const deltaY = dragState.current.startY - e.clientY;
    const maxT = getMaxTranslate();
    const newTranslate = Math.max(0, Math.min(maxT, dragState.current.startTranslate - deltaY));
    sheetRef.current.style.transform = `translateY(${newTranslate}px)`;
  };

  const toggleSheet = () => {
    const cur = getCurrentTranslate();
    const snaps = getSnapPoints();
    const target = cur >= snaps.half ? snaps.full : snaps.collapsed;
    snapTo(target);
  };

  const handleSheetPointerUp = () => {
    if (!dragState.current.dragging || !sheetRef.current) return;
    dragState.current.dragging = false;
    const curTranslate = getCurrentTranslate();
    const clamped = Math.max(0, Math.min(getMaxTranslate(), curTranslate));
    const snaps = getSnapPoints();
    const values = Object.values(snaps);
    let target = snaps.collapsed;
    let minDist = Infinity;
    for (const val of values) {
      const dist = Math.abs(val - clamped);
      if (dist < minDist) { minDist = dist; target = val; }
    }
    snapTo(target);
  };

  const handleLocate = () => {
    setLocating(true); setMenuOpen(false);
    getDriverLocation()
      .then((loc) => { setDriverLocation(loc); setStartLocation(loc); setLocating(false); })
      .catch(() => { setError(pt.gpsError); setLocating(false); });
  };

  return (
    <div className="h-screen relative overflow-hidden bg-gray-950" dir={dir}>
      {/* ===== Full-screen map ===== */}
      <div className="absolute inset-0 z-0">
        <MapView
          ref={mapRef}
          waypoints={route?.waypoints || []}
          customers={customers}
          driverLocation={driverLocation}
          startLocation={!driverLocation ? startLocation : null}
          nextStopId={nextStopId}
          completedIds={completedIds}
          skippedIds={skippedIds}
          followDriver={false}
          onManualPan={() => {
            const snaps = getSnapPoints();
            if (Math.abs(getCurrentTranslate() - snaps.collapsed) > 20) snapTo(snaps.collapsed);
          }}
          height="100%"
        />
      </div>

      {/* ===== Corner menu button (top-left) ===== */}
      <div className="absolute top-4 left-12 z-20">
        <button onClick={() => setMenuOpen(!menuOpen)}
          className="w-11 h-11 bg-gray-900/80 backdrop-blur-xl rounded-full shadow-2xl border border-gray-700/50 flex items-center justify-center text-white transition-all active:scale-90 hover:bg-gray-800/90">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
            <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
          </svg>
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0" onClick={() => setMenuOpen(false)} style={{ zIndex: 15 }} />
            <div className="absolute top-12 left-0 w-52 bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-700/50 p-2 space-y-1" style={{ zIndex: 20 }}>
              <button onClick={handleLocate} disabled={locating}
                className="w-full py-2.5 px-3 text-sm text-gray-200 hover:bg-white/10 rounded-xl transition-all flex items-center gap-3 disabled:opacity-40">
                <span className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center text-xs">
                  {driverLocation ? '✅' : '📍'}
                </span>
                {locating ? pt.locating : driverLocation ? pt.located : pt.locateMe}
              </button>
              <div className="border-t border-gray-700/50 my-1" />
              <div className="px-3 py-2">
                <p className="text-[11px] text-gray-500 font-medium mb-1.5">{pt.language}</p>
                <LanguageSwitcher onSelect={() => setMenuOpen(false)} />
              </div>
              <div className="border-t border-gray-700/50 my-1" />
              <button onClick={handleClear}
                className="w-full py-2.5 px-3 text-sm text-red-400 hover:bg-red-500/10 rounded-xl transition-all flex items-center gap-3">
                <span className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center text-xs">🗑️</span>
                {pt.clearAll}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ===== Locate button (top-right) ===== */}
      <button onClick={() => {
          if (driverLocation) { mapRef.current?.recenter(driverLocation.lat, driverLocation.lng); setSheetTranslate(getCollapsedTranslate()); }
          else handleLocate();
        }}
          className="absolute top-4 right-4 z-20 w-11 h-11 bg-gray-900/80 backdrop-blur-xl rounded-full shadow-2xl border border-gray-700/50 flex items-center justify-center transition-all active:scale-90 hover:bg-gray-800/90">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-blue-400">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
        </button>

      {/* ===== Clipboard detection banner ===== */}
      {pendingLocation && (
        <div className="absolute top-16 left-4 right-4 z-20">
          <ClipboardBanner
            location={pendingLocation.location}
            address={pendingLocation.text}
            source={locationSource}
            onAdd={handleDetectedAdd}
            onDismiss={() => { setShareLocation(null); dismissClip(); }}
          />
        </div>
      )}

      {/* ===== Draggable Bottom Sheet ===== */}
        <div ref={sheetRef}
          className="fixed bottom-0 left-0 right-0 z-10 bg-gray-900/95 backdrop-blur-2xl rounded-t-3xl shadow-2xl border-t border-gray-700/50"
          style={{
            height: '85vh',
            transform: `translateY(${sheetTranslate}px)`,
            transition: 'transform 0.3s ease-out',
          }}>
          {/* Drag handle + summary (pointer capture area) */}
          <div onPointerDown={handleSheetPointerDown}
            onPointerMove={handleSheetPointerMove}
            onPointerUp={handleSheetPointerUp}
            onPointerCancel={handleSheetPointerUp}
            onClick={() => { if (!dragState.current.moved) toggleSheet(); }}
            className="cursor-grab active:cursor-grabbing select-none"
            style={{ touchAction: 'none' }}>
            {/* Handle bar */}
            <div className="flex justify-center pt-2.5 pb-1 relative">
              <div className="w-10 h-1 rounded-full bg-gray-600" />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 transition-transform duration-200"
                style={{ transform: `rotate(${sheetTranslate < getMaxTranslate() / 2 ? 180 : 0}deg)` }}>
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-gray-500">
                  <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>
                </svg>
              </div>
            </div>

            {/* Summary bar for route */}
            {hasRoute && (
              <div className="px-4 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-gray-100 font-semibold">{sortedWps.length} {rt.stops}</span>
                    <span className="text-gray-500">·</span>
                    <span className="text-gray-300">{route!.totalDistance.toFixed(1)} {rt.km}</span>
                    <span className="text-gray-500">·</span>
                    <span className="text-gray-300">
                      {route!.totalDuration >= 60
                        ? `${Math.floor(route!.totalDuration / 60)}h ${Math.round(route!.totalDuration % 60)}m`
                        : `${Math.round(route!.totalDuration)} ${rt.min}`}
                    </span>
                  </div>
                  <div className="w-5" />
                </div>
              </div>
            )}

            {/* Summary for no-route */}
            {!hasRoute && (
              <div className="px-4 pb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-300 font-semibold">{rt.addStop}</span>
                </div>
              </div>
            )}
          </div>

          {/* Scrollable content (visible when expanded) */}
          <div className="overflow-y-auto overscroll-contain px-4 pb-6 space-y-4" style={{ height: 'calc(85vh - 72px)', touchAction: 'pan-y' }}
            onPointerDown={() => {
              const snaps = getSnapPoints();
              if (Math.abs(getCurrentTranslate() - snaps.collapsed) < 20) snapTo(snaps.half);
            }}
            onWheel={() => {
              const snaps = getSnapPoints();
              if (Math.abs(getCurrentTranslate() - snaps.collapsed) < 20) snapTo(snaps.half);
            }}>
            {hasRoute ? (
              <>
                {/* Action buttons */}
                <div className="flex gap-2 pt-2">
                  <button onClick={optimize} disabled={loading}
                    className="flex-1 py-3 bg-white/10 text-white text-sm font-bold rounded-xl hover:bg-white/20 transition-all active:scale-[0.97] border border-gray-600/50 flex items-center justify-center gap-2 disabled:opacity-40">
                    {loading ? (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <><span className="text-base">🔄</span> {pt.reoptimize}</>
                    )}
                  </button>
                </div>

                {/* Error display */}
                {error && (
                  <div className="bg-red-900/30 border border-red-500/20 text-red-400 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
                    <span>⚠️</span> {error}
                  </div>
                )}

                {/* Add more stops while route exists */}
                <div className="pt-2 border-t border-gray-700/30">
                  <p className="text-xs text-gray-500 font-medium mb-2">{rt.addStop}</p>
                  <CustomerInput customers={customers} onChange={setCustomers} onFocus={() => setSheetTranslate(0)} />
                </div>

                {/* Full route details */}
                <div className="pt-2 border-t border-gray-700/30">
                  <RouteList
                    waypoints={route!.waypoints}
                    totalDistance={route!.totalDistance}
                    totalDuration={route!.totalDuration}
                    completedIds={completedIds}
                    skippedIds={skippedIds}
                    onMarkComplete={handleMarkComplete}
                    onUndoComplete={handleUndoComplete}
                    onSkip={handleSkip}
                    onUnskip={handleUnskip}
                  />
                  <button onClick={handleClear}
                    className="w-full mt-4 py-2.5 text-xs text-gray-500 hover:text-red-400 rounded-xl border border-dashed border-gray-700/50 hover:border-red-500/30 transition-all flex items-center justify-center gap-1.5 hover:bg-red-500/10">
                    🗑️ {pt.clearAll}
                  </button>
                </div>
              </>
            ) : (
              <>
                {showPasteButton && (
                  <button onClick={handleManualPaste} disabled={pasting}
                    className="w-full py-2.5 bg-gray-800/50 hover:bg-gray-800 text-gray-300 text-xs font-semibold rounded-xl border border-gray-700/30 hover:border-gray-600/50 transition-all active:scale-[0.97] flex items-center justify-center gap-2 disabled:opacity-40">
                    {pasting ? (
                      <span className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin" />
                    ) : (
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-gray-400"><path d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"/></svg>
                    )}
                    {t.detection.pasteLocation}
                  </button>
                )}

                {error && (
                  <div className="bg-red-900/30 border border-red-500/20 text-red-400 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
                    <span>⚠️</span> {error}
                  </div>
                )}

                <CustomerInput customers={customers} onChange={setCustomers} />

                {customers.length > 0 && (
                  <button onClick={optimize} disabled={loading || (!driverLocation && !startLocation)}
                    className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl text-sm font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98] flex items-center justify-center gap-2.5">
                    {loading ? (
                      <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {pt.optimizing}</span>
                    ) : (
                      <><span className="text-base">🚀</span> {pt.optimizeRoute}</>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
    </div>
  );
}
