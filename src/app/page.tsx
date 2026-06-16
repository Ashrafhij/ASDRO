'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Customer, Location, Waypoint, OptimizedRoute } from '@/lib/types';
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
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { trackEventFireAndForget } from '@/lib/analytics';

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
  const [pendingCustomer, setPendingCustomer] = useState<Customer | null>(null);
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);
  const [arrivedStop, setArrivedStop] = useState<Waypoint | null>(null);
  const [pendingStopName, setPendingStopName] = useState('');
  useEffect(() => { setPendingStopName(''); }, [pendingCustomer]);
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isOnline = useOnlineStatus();
  const { detected: clipLocation, dismiss: dismissClip, showButton: showPasteButton } = useClipboardDetection();
  const hasRoute = route && route.waypoints.length > 0;
  const sortedWps = hasRoute ? [...route!.waypoints].sort((a, b) => a.order - b.order) : [];
  const activeWaypoint = sortedWps.find(w => !completedIds.has(w.customer.id) && !skippedIds.has(w.customer.id));
  const nextStopId = activeWaypoint?.customer.id || null;
  const arrivedStopId = arrivedStop?.customer.id || null;

  useEffect(() => { save('customers', customers); }, [customers]);
  useEffect(() => { save('route', route); }, [route]);
  useEffect(() => { save('completed', [...completedIds]); }, [completedIds]);
  useEffect(() => { save('skipped', [...skippedIds]); }, [skippedIds]);
  useEffect(() => { if (newlyAddedId) { const t = setTimeout(() => setNewlyAddedId(null), 3000); return () => clearTimeout(t); } }, [newlyAddedId]);

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
    setPendingCustomer(newCustomer);
    setShareLocation(null);
    dismissClip();
    trackEventFireAndForget('detected_add');
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
      setPendingCustomer(newCustomer);
      setPasting(false);
      trackEventFireAndForget('manual_paste');
    } catch {
      setError('Could not read clipboard. ASDRO needs HTTPS or a user gesture.');
      setPasting(false);
    }
  }, []);

  const handlePendingAdd = useCallback((customer: Customer) => {
    setPendingCustomer(customer);
  }, []);

  const handleAccept = useCallback(() => {
    if (!pendingCustomer) return;
    const named = { ...pendingCustomer, name: pendingStopName || '' };
    const id = named.id;
    setCustomers(prev => [...prev, named]);
    setNewlyAddedId(id);
    setPendingCustomer(null);
    trackEventFireAndForget('add_stop');
    if (route && driverLocation) {
      setLoading(true);
      optimizeRoute([...customers, named], driverLocation, locale)
        .then(result => setRoute(result))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [pendingCustomer, pendingStopName, customers, route, driverLocation, locale]);

  const handleCancel = useCallback(() => {
    setPendingCustomer(null);
  }, []);

  // Auto-expand sheet when preview is shown
  const prevPendingRef = useRef<Customer | null>(null);
  useEffect(() => {
    if (pendingCustomer && !prevPendingRef.current) {
      const snaps = getSnapPoints();
      snapTo(snaps.half);
    }
    prevPendingRef.current = pendingCustomer;
  }, [pendingCustomer]);

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
      trackEventFireAndForget('optimize_route');
    } catch { setError(pt.optimizationFailed); }
    finally { setLoading(false); }
  }, [customers, startLocation, driverLocation, locale, pt]);

  // Arrival detection — shows confirmation instead of auto-completing
  useEffect(() => {
    if (!driverLocation || !route || arrivedStop) return;
    const sorted = [...route.waypoints].sort((a, b) => a.order - b.order);
    const nextStop = sorted.find(w => !completedIds.has(w.customer.id) && !skippedIds.has(w.customer.id));
    if (!nextStop) return;
    const R = 6371000;
    const dLat = (nextStop.customer.location.lat - driverLocation.lat) * Math.PI / 180;
    const dLng = (nextStop.customer.location.lng - driverLocation.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(driverLocation.lat * Math.PI / 180) * Math.cos(nextStop.customer.location.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    if (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) < 50) {
      setArrivedStop(nextStop);
      const snaps = getSnapPoints();
      snapTo(snaps.full);
      trackEventFireAndForget('arrived_at_stop');
      try { navigator.vibrate?.(200); } catch {}
    }
  }, [driverLocation, route, completedIds, skippedIds, arrivedStop]);

  // Auto-dismiss arrival when driver moves >100m away
  useEffect(() => {
    if (!arrivedStop || !driverLocation) return;
    const R = 6371000;
    const dLat = (arrivedStop.customer.location.lat - driverLocation.lat) * Math.PI / 180;
    const dLng = (arrivedStop.customer.location.lng - driverLocation.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(driverLocation.lat * Math.PI / 180) * Math.cos(arrivedStop.customer.location.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    if (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) > 100) {
      setArrivedStop(null);
    }
  }, [driverLocation, arrivedStop]);

  const handleMarkComplete = useCallback(async (customerId: string) => {
    const newCompleted = new Set(completedIds); newCompleted.add(customerId);
    setCompletedIds(newCompleted);
    trackEventFireAndForget('mark_complete');
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
    trackEventFireAndForget('skip_stop');
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

  const handleArrivedDone = useCallback(() => {
    if (!arrivedStop) return;
    const id = arrivedStop.customer.id;
    setArrivedStop(null);
    handleMarkComplete(id);
  }, [arrivedStop, handleMarkComplete]);

  const handleArrivedSkip = useCallback(() => {
    if (!arrivedStop) return;
    const id = arrivedStop.customer.id;
    setArrivedStop(null);
    handleSkip(id);
  }, [arrivedStop, handleSkip]);

  const handleClear = () => {
    setCustomers([]); setRoute(null); setCompletedIds(new Set());
    setSkippedIds(new Set()); setError('');
    setMenuOpen(false);
    setArrivedStop(null);
    trackEventFireAndForget('clear_all');
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
      .then((loc) => { setDriverLocation(loc); setStartLocation(loc); setLocating(false); trackEventFireAndForget('locate_me'); })
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
          arrivedStopId={arrivedStopId}
          completedIds={completedIds}
          skippedIds={skippedIds}
          pendingCustomer={pendingCustomer}
          followDriver={false}
          onManualPan={() => {
            const snaps = getSnapPoints();
            if (Math.abs(getCurrentTranslate() - snaps.collapsed) > 20) snapTo(snaps.collapsed);
          }}
          height="100%"
        />
      </div>

      {/* ===== Corner menu button (top-left) ===== */}
      <div className={`absolute left-12 z-40 transition-all ${isOnline ? 'top-4' : 'top-14'}`}>
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
      <div className={`absolute right-4 z-40 transition-all ${isOnline ? 'top-4' : 'top-14'}`}>
        <button onClick={() => {
            if (driverLocation) { mapRef.current?.recenter(driverLocation.lat, driverLocation.lng); setSheetTranslate(getCollapsedTranslate()); }
            else handleLocate();
          }}
            className="w-11 h-11 bg-gray-900/80 backdrop-blur-xl rounded-full shadow-2xl border border-gray-700/50 flex items-center justify-center transition-all active:scale-90 hover:bg-gray-800/90">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-blue-400">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </button>
        </div>

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

      {/* ===== Offline Banner ===== */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-600/90 backdrop-blur-sm px-4 py-2.5 pt-[env(safe-area-inset-top)] text-center text-sm font-semibold text-yellow-50 shadow-lg flex items-center justify-center gap-2">
          <span>⚠️</span> {t.detection.offlineMode}
        </div>
      )}

      {/* ===== Draggable Bottom Sheet ===== */}
        <div ref={sheetRef}
          className="fixed bottom-0 left-0 right-0 z-10 bg-gray-900/95 backdrop-blur-2xl rounded-t-3xl shadow-2xl border-t border-gray-700/50"
          style={{
            height: '85dvh',
            transform: `translateY(${sheetTranslate}px)`,
            transition: 'transform 0.3s ease-out',
          }}>
          {/* Drag zone — handle, summary, and action buttons (~132px, all touch-draggable) */}
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

            {/* Summary / Confirmation / Action buttons */}
            {pendingCustomer ? (
              <div className="px-4 pb-3 space-y-3">
                <div className="bg-gray-800/50 border border-yellow-500/30 rounded-2xl p-4 space-y-3">
                  <p className="text-[10px] text-yellow-400 font-semibold uppercase tracking-wider">{pt.preview}</p>
                  <p className="text-sm text-gray-100 leading-relaxed">{pendingCustomer.address}</p>
                  <input type="text"
                    placeholder="Label (e.g. Client name)"
                    value={pendingStopName}
                    onChange={(e) => setPendingStopName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full px-3 py-2.5 bg-gray-700/50 border border-gray-600/50 rounded-xl text-sm text-gray-100 placeholder-gray-500 focus:bg-gray-700 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all" />
                </div>
                <div className="flex gap-3">
                  <button onClick={(e) => { e.stopPropagation(); handleCancel(); }}
                    className="flex-1 py-3 bg-gray-700 text-white text-sm font-bold rounded-xl hover:bg-gray-600 transition-all active:scale-[0.97]">
                    {pt.cancel}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleAccept(); }}
                    className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all active:scale-[0.97] shadow-lg shadow-blue-500/20">
                    {pt.accept}
                  </button>
                </div>
                {error && (
                  <div className="bg-red-900/30 border border-red-500/20 text-red-400 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
                    <span>⚠️</span> {error}
                  </div>
                )}
              </div>
            ) : arrivedStop ? (
              <div className="px-4 pb-3 space-y-3">
                <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-2xl p-5 text-center">
                  <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-2">🚩 {pt.arrived}</p>
                  {arrivedStop.customer.name ? (
                    <>
                      <p className="text-base text-gray-100 font-bold leading-relaxed">{arrivedStop.customer.name}</p>
                      <p className="text-xs text-gray-400 mt-1">{arrivedStop.customer.address}</p>
                    </>
                  ) : (
                    <p className="text-sm sm:text-base text-gray-100 font-semibold leading-relaxed">{arrivedStop.customer.address}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">{pt.arrivedAt} {arrivedStop.order} / {sortedWps.length}</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={(e) => { e.stopPropagation(); handleArrivedSkip(); }}
                    className="flex-1 py-3 bg-gray-700 text-white text-sm font-bold rounded-xl hover:bg-gray-600 transition-all active:scale-[0.97]">
                    {rt.skip}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleArrivedDone(); }}
                    className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-green-600 text-white text-sm font-bold rounded-xl hover:from-emerald-700 hover:to-green-700 transition-all active:scale-[0.97] shadow-lg shadow-emerald-500/30">
                    ✅ {pt.markDone}
                  </button>
                </div>
                {error && (
                  <div className="bg-red-900/30 border border-red-500/20 text-red-400 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
                    <span>⚠️</span> {error}
                  </div>
                )}
              </div>
            ) : hasRoute ? (
              <div className="px-4 pb-3 space-y-3">
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
                {/* Reoptimize button */}
                <div className="flex gap-2">
                  <button onClick={optimize} disabled={loading || !isOnline}
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
              </div>
            ) : (
              <div className="px-4 pb-3 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-300 font-semibold">{rt.addStop}</span>
                </div>
                {/* Paste button */}
                {isOnline && showPasteButton && (
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
                {/* Error display */}
                {error && (
                  <div className="bg-red-900/30 border border-red-500/20 text-red-400 px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2">
                    <span>⚠️</span> {error}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Scrollable content (below the drag zone).
              overscroll-none prevents scroll chaining / rubber-banding on iOS Safari.
              The inner min-h[calc(100%+1px)] guarantees the container is always
              1px scrollable so the browser never passes touch gestures to the body. */}
           <div ref={scrollContainerRef} className="overflow-y-auto overscroll-none px-4 pb-32 space-y-4" style={{ height: 'calc(85dvh - 132px)', touchAction: 'pan-y' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              const snaps = getSnapPoints();
              if (Math.abs(getCurrentTranslate() - snaps.collapsed) < 20) snapTo(snaps.half);
            }}
            onPointerMove={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onWheel={(e) => {
              e.stopPropagation();
              const snaps = getSnapPoints();
              if (Math.abs(getCurrentTranslate() - snaps.collapsed) < 20) snapTo(snaps.half);
            }}>
            <div style={{ minHeight: 'calc(100% + 1px)' }}>
            {hasRoute ? (
              <>
                {/* Add more stops while route exists */}
                <div className="pt-2 border-t border-gray-700/30">
                  <p className="text-xs text-gray-500 font-medium mb-2">{rt.addStop}</p>
                  <CustomerInput customers={customers} onChange={setCustomers} onAdd={handlePendingAdd} onFocus={() => { setSheetTranslate(0); scrollContainerRef.current?.scrollTo(0, 0); }} disabled={!isOnline} newlyAddedId={newlyAddedId} />
                </div>

                {/* Full route details */}
                <div className="border-t border-gray-700/30">
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
                    newlyAddedId={newlyAddedId}
                  />
                  <button onClick={handleClear}
                    className="w-full mt-4 py-2.5 text-xs text-gray-500 hover:text-red-400 rounded-xl border border-dashed border-gray-700/50 hover:border-red-500/30 transition-all flex items-center justify-center gap-1.5 hover:bg-red-500/10">
                    🗑️ {pt.clearAll}
                  </button>
                </div>
              </>
            ) : (
              <>
                <CustomerInput customers={customers} onChange={setCustomers} onAdd={handlePendingAdd} onFocus={() => { setSheetTranslate(0); scrollContainerRef.current?.scrollTo(0, 0); }} disabled={!isOnline} newlyAddedId={newlyAddedId} />

                {customers.length > 0 && (
                  <button onClick={optimize} disabled={loading || !isOnline || (!driverLocation && !startLocation)}
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
    </div>
  );
}
