'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Customer, Location, Waypoint, OptimizedRoute } from '@/lib/types';
import { optimizeRoute, formatInstruction } from '@/lib/optimizer';
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
  const [followDriver, setFollowDriver] = useState(true);
  const [navigationMode, setNavigationMode] = useState(false);
  const [nextStopDistance, setNextStopDistance] = useState<number | null>(null);
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

  function turnArrowSvg(size: number, type: string, modifier?: string): string {
    const angle: Record<string, number> = { left: -90, right: 90, straight: 0, slight_left: -40, slight_right: 40, sharp_left: -135, sharp_right: 135, uturn: 180 };
    if (type === 'roundabout' || type === 'rotary') {
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="12" r="9" fill="none" stroke="#fff" stroke-width="2.5"/><path d="M12 3 L8 8 L16 8 Z" fill="#fff"/></svg>`;
    }
    const rot = angle[modifier || ''] ?? 0;
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="#fff"><g transform="rotate(${rot}, 12, 12)"><path d="M12 2 L18 10 L14 10 L14 22 L10 22 L10 10 L6 10 Z"/></g></svg>`;
  }

  useEffect(() => { save('customers', customers); }, [customers]);
  useEffect(() => { save('route', route); }, [route]);
  useEffect(() => { save('completed', [...completedIds]); }, [completedIds]);
  useEffect(() => { save('skipped', [...skippedIds]); }, [skippedIds]);
  useEffect(() => { if (newlyAddedId) { const t = setTimeout(() => setNewlyAddedId(null), 3000); return () => clearTimeout(t); } }, [newlyAddedId]);

  // Auto-exit navigation mode when all stops are done
  useEffect(() => {
    if (navigationMode && hasRoute && !activeWaypoint) setNavigationMode(false);
  }, [navigationMode, hasRoute, activeWaypoint]);

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

  // Compute haversine distance to next active stop
  useEffect(() => {
    if (!driverLocation || !route) { setNextStopDistance(null); return; }
    const sorted = [...route.waypoints].sort((a, b) => a.order - b.order);
    const nextStop = sorted.find(w => !completedIds.has(w.customer.id) && !skippedIds.has(w.customer.id));
    if (!nextStop) { setNextStopDistance(null); return; }
    const R = 6371000;
    const dLat = (nextStop.customer.location.lat - driverLocation.lat) * Math.PI / 180;
    const dLng = (nextStop.customer.location.lng - driverLocation.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(driverLocation.lat * Math.PI / 180) * Math.cos(nextStop.customer.location.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    setNextStopDistance(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }, [driverLocation, route, completedIds, skippedIds]);

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

  const btnOpacity = Math.min(1, Math.max(0, 1 - (getSnapPoints().collapsed - sheetTranslate) / 50));
  const turnText = (s?: { type: string; modifier?: string; name?: string }) =>
    s ? formatInstruction({ maneuver: { type: s.type, modifier: s.modifier }, name: s.name || '' }, locale) : '';

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
          followDriver={followDriver && !!hasRoute}
          navigationMode={navigationMode}
          onManualPan={() => {
            const snaps = getSnapPoints();
            if (Math.abs(getCurrentTranslate() - snaps.collapsed) > 20) snapTo(snaps.collapsed);
          }}
          height="100%"
        />
      </div>

      {/* ===== UI Safe Zone (z-40, sits between map and bottom sheet) ===== */}
      <div className="absolute inset-0 z-40 pointer-events-none flex flex-col justify-between">

        {/* ===== Top Safe Zone ===== */}
        <div className="flex flex-col gap-2 p-4 pt-[max(env(safe-area-inset-top,16px),16px)]">

          {/* Offline Banner */}
          {!isOnline && (
            <div className="pointer-events-auto bg-yellow-600/90 backdrop-blur-sm px-4 py-2.5 rounded-xl text-center text-sm font-semibold text-yellow-50 shadow-lg flex items-center justify-center gap-2">
              <span>⚠️</span> {t.detection.offlineMode}
            </div>
          )}

          {/* Navigation Instruction Card */}
          {navigationMode && hasRoute && activeWaypoint && activeWaypoint.steps?.[0] && (
            <div className="relative pointer-events-auto">
              <div className="bg-[#0f5156]/95 backdrop-blur-md border border-emerald-700/30 rounded-2xl px-5 py-4 flex items-center gap-4 shadow-2xl shadow-emerald-900/30">
                <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0"
                  dangerouslySetInnerHTML={{ __html: turnArrowSvg(28, activeWaypoint.steps[0].type, activeWaypoint.steps[0].modifier) }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-white leading-tight">{turnText(activeWaypoint.steps[0])}</p>
                </div>
                {nextStopDistance !== null && nextStopDistance !== undefined && nextStopDistance > 0 && (
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] text-white/50 uppercase tracking-wider">{pt.remaining}</p>
                    <p className="text-xl font-bold text-white tabular-nums">
                      {nextStopDistance >= 1000 ? `${(nextStopDistance / 1000).toFixed(1)}` : `${Math.round(nextStopDistance)}`}
                    </p>
                    <p className="text-[10px] text-white/50">{nextStopDistance >= 1000 ? 'km' : 'm'}</p>
                  </div>
                )}
              </div>
              {activeWaypoint.steps?.[1] && (
                <div className="absolute -bottom-9 left-3 bg-[#0a3d40] rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-lg">
                  <span className="text-[10px] text-white/60 font-semibold uppercase tracking-wide">Then</span>
                  <div className="w-4 h-4 flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: turnArrowSvg(14, activeWaypoint.steps[1].type, activeWaypoint.steps[1].modifier) }} />
                  <span className="text-[11px] text-white font-medium truncate max-w-[130px]">{turnText(activeWaypoint.steps[1])}</span>
                </div>
              )}
            </div>
          )}

          {/* Clipboard Banner */}
          {pendingLocation && (
            <div className="pointer-events-auto">
              <ClipboardBanner
                location={pendingLocation.location}
                address={pendingLocation.text}
                source={locationSource}
                onAdd={handleDetectedAdd}
                onDismiss={() => { setShareLocation(null); dismissClip(); }}
              />
            </div>
          )}
        </div>

        {/* ===== Middle Safe Zone (flex-1, action buttons at bottom-right) ===== */}
        <div className="flex-1 relative pointer-events-none" />
      </div>

      {/* ===== Bottom-left button stack (z-[60], above sheet, fades as sheet expands) ===== */}
      <div className="fixed z-[60] left-4" style={{ bottom: 'calc(15vh + 80px)', opacity: btnOpacity, transition: 'opacity 0.15s ease-out', pointerEvents: btnOpacity > 0.05 ? 'auto' : 'none' }}>
        <div className="flex flex-col gap-2">
          {/* Menu button */}
          <div className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)}
              className="w-11 h-11 bg-gray-900/80 backdrop-blur-xl rounded-full shadow-2xl border border-gray-700/50 flex items-center justify-center transition-all active:scale-90 hover:bg-gray-800/90">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
              </svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0" onClick={() => setMenuOpen(false)} style={{ zIndex: 45 }} />
                <div className="absolute bottom-full left-0 mb-2 z-50 w-52 bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-700/50 p-2 space-y-1">
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

          {/* Back button (nav mode) */}
          {navigationMode && (
            <button onClick={() => setNavigationMode(false)}
              className="w-11 h-11 bg-gray-900/80 backdrop-blur-xl rounded-full shadow-2xl border border-gray-700/50 flex items-center justify-center transition-all active:scale-90 hover:bg-gray-800/90">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            </button>
          )}

          {/* Bottom button: Sparkle (nav), or Locate + Follow (normal) */}
          {navigationMode ? (
            <button className="w-11 h-11 bg-gray-900/80 backdrop-blur-xl rounded-full shadow-2xl border border-gray-700/50 flex items-center justify-center transition-all active:scale-90">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-blue-400"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
            </button>
          ) : (
            <>
              <button onClick={() => {
                  if (driverLocation) { mapRef.current?.recenter(driverLocation.lat, driverLocation.lng); setSheetTranslate(getCollapsedTranslate()); setFollowDriver(true); }
                  else handleLocate();
                }}
                className="w-11 h-11 bg-gray-900/80 backdrop-blur-xl rounded-full shadow-2xl border border-gray-700/50 flex items-center justify-center transition-all active:scale-90 hover:bg-gray-800/90">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-blue-400">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
              </button>
              {hasRoute && (
                <button onClick={() => setFollowDriver(v => !v)}
                  className={`w-11 h-11 rounded-full shadow-2xl border flex items-center justify-center transition-all active:scale-90 ${followDriver ? 'bg-blue-600/80 border-blue-500/60' : 'bg-gray-900/80 border-gray-700/50 hover:bg-gray-800/90'}`}>
                  <svg viewBox="0 0 24 24" className={`w-5 h-5 ${followDriver ? 'fill-white' : 'fill-gray-400'}`}>
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                  </svg>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ===== Floating action panel (nav mode, z-[60] above sheet, fades as sheet expands) ===== */}
      {navigationMode && (
        <div className="fixed z-[60] right-4" style={{ bottom: 'calc(15vh + 80px)', opacity: btnOpacity, transition: 'opacity 0.15s ease-out', pointerEvents: btnOpacity > 0.05 ? 'auto' : 'none' }}>
          <div className="bg-gray-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 shadow-2xl flex flex-col gap-px">
            <button title="Re-center" onClick={() => { if (driverLocation) { mapRef.current?.recenter(driverLocation.lat, driverLocation.lng); setFollowDriver(true); } }}
              className="w-11 h-11 rounded-xl hover:bg-white/10 flex items-center justify-center active:scale-90 transition-all">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white/80" style={{ transform: `rotate(${-(driverLocation?.heading || 0)}deg)` }}>
                <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
              </svg>
            </button>
            <div className="mx-2.5 h-px bg-white/10" />
            <button title="Search"
              className="w-11 h-11 rounded-xl hover:bg-white/10 flex items-center justify-center active:scale-90 transition-all">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white/80">
                <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 0 0 9.5 3C6.08 3 3.28 5.64 3.03 9h2.02C5.3 6.75 7.18 5 9.5 5 11.99 5 14 7.01 14 9.5S11.99 14 9.5 14c-.17 0-.33-.03-.5-.05v2.02c.17.02.33.03.5.03 1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6-7C7.01 7 5 9.01 5 11.5S7.01 16 9.5 16 14 13.99 14 11.5 11.99 7 9.5 7z"/>
              </svg>
            </button>
            <div className="mx-2.5 h-px bg-white/10" />
            <button title="Mute"
              className="w-11 h-11 rounded-xl hover:bg-white/10 flex items-center justify-center active:scale-90 transition-all">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white/80">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                <line x1="4" y1="4" x2="20" y2="20" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"/>
              </svg>
            </button>
            <div className="mx-2.5 h-px bg-white/10" />
            <button title="Report"
              className="w-11 h-11 rounded-xl hover:bg-white/10 flex items-center justify-center active:scale-90 transition-all">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-yellow-400">
                <path d="M12 2L1 21h22L12 2zm0 3.83L18.28 19H5.72L12 5.83zM11 16h2v2h-2v-2zm0-6h2v4h-2v-4z"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ===== Draggable Bottom Sheet ===== */}
        <div ref={sheetRef}
          className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-2xl rounded-t-3xl shadow-2xl border-t border-gray-700/50"
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

            {/* Next-turn banner (non-nav mode, inside sheet so always visible when collapsed) */}
            {!navigationMode && hasRoute && activeWaypoint && activeWaypoint.steps?.[0] && (
              <div className="px-4 pb-2">
                <div className="bg-gray-800/60 backdrop-blur-xl border border-blue-500/25 rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-500/15 flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-blue-400">
                      <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-blue-300 font-semibold uppercase tracking-wider">{pt.nextTurn}</p>
                    <p className="text-sm text-gray-100 font-medium truncate">{turnText(activeWaypoint.steps[0])}</p>
                  </div>
                  {nextStopDistance !== null && (
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-gray-400">{pt.remaining}</p>
                      <p className="text-sm text-gray-100 font-semibold tabular-nums">
                        {nextStopDistance >= 1000
                          ? `${(nextStopDistance / 1000).toFixed(1)} km`
                          : `${Math.round(nextStopDistance)} m`}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Summary / Confirmation / Arrival / Add Stop */}
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
                <div className="flex justify-between items-stretch py-4 px-2">
                  <div className="flex flex-col items-center flex-1">
                    <span className="text-xl font-bold text-white">{sortedWps.length}</span>
                    <span className="text-xs text-gray-400 mt-0.5">{rt.stops}</span>
                  </div>
                  <div className="flex flex-col items-center flex-1 border-x border-gray-700/50">
                    <span className="text-xl font-bold text-white">{route!.totalDistance.toFixed(1)}</span>
                    <span className="text-xs text-gray-400 mt-0.5">{rt.km}</span>
                  </div>
                  <div className="flex flex-col items-center flex-1">
                    <span className="text-xl font-bold text-white">
                      {route!.totalDuration >= 60
                        ? `${Math.floor(route!.totalDuration / 60)}`
                        : `${Math.round(route!.totalDuration)}`}
                    </span>
                    <span className="text-xs text-gray-400 mt-0.5">
                      {route!.totalDuration >= 60
                        ? `h ${Math.round(route!.totalDuration % 60)}m`
                        : rt.min}
                    </span>
                  </div>
                </div>
                {/* Navigate + Reoptimize buttons */}
                <div className="flex gap-2">
                  <button onClick={optimize} disabled={loading || !isOnline}
                    className="flex-1 py-3 bg-white/10 text-white text-sm font-bold rounded-xl hover:bg-white/20 transition-all active:scale-[0.97] border border-gray-600/50 flex items-center justify-center gap-2 disabled:opacity-40">
                    {loading ? (
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <><span className="text-base">🔄</span> {pt.reoptimize}</>
                    )}
                  </button>
                  {!navigationMode && (
                    <button onClick={() => { setNavigationMode(true); }}
                      className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-bold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all active:scale-[0.97] shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2">
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
                      Navigate
                    </button>
                  )}
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
