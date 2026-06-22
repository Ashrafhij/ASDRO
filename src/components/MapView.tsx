'use client';

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Location, Waypoint, Customer, TurnStep } from '@/lib/types';
import { useI18n } from '@/lib/i18n-context';

export interface MapViewRef {
  recenter: (lat: number, lng: number) => void;
}

interface MapViewProps {
  waypoints: Waypoint[];
  customers?: Customer[];
  driverLocation: Location | null;
  startLocation: Location | null;
  endPoint?: { location: Location; label: string } | null;
  height?: string;
  followDriver?: boolean;
  onManualPan?: () => void;
  nextStopId?: string | null;
  arrivedStopId?: string | null;
  completedIds?: Set<string>;
  skippedIds?: Set<string>;
  pendingCustomer?: Customer | null;
  navigationMode?: boolean;
}

function maneuverIconHtml(type: string, modifier: string | undefined, opacity: number): string {
  const bg = type === 'fork' ? 'rgba(245,158,11,0.9)'
    : type === 'merge' ? 'rgba(139,92,246,0.9)'
    : type === 'roundabout' || type === 'rotary' ? 'rgba(16,185,129,0.9)'
    : 'rgba(26,115,232,0.85)';
  const angle: Record<string, number> = { left: -90, right: 90, straight: 0, slight_left: -40, slight_right: 40, sharp_left: -135, sharp_right: 135, uturn: 180 };
  let inner: string;
  if (type === 'roundabout' || type === 'rotary') {
    inner = `<svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#fff" stroke-width="2.5"/><path d="M12 3 L8 8 L16 8 Z" fill="#fff"/></svg>`;
  } else {
    const rot = angle[modifier || ''] ?? 0;
    inner = `<svg width="14" height="14" viewBox="0 0 24 24"><g transform="rotate(${rot}, 12, 12)"><path d="M12 2 L18 10 L14 10 L14 22 L10 22 L10 10 L6 10 Z" fill="#fff"/></g></svg>`;
  }
  return `<div style="width:24px;height:24px;border-radius:50%;background:${bg};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;opacity:${opacity}">${inner}</div>`;
}

function addRoutePolyline(group: L.LayerGroup, coords: [number, number][], navigationMode?: boolean) {
  if (navigationMode) {
    L.polyline(coords, { color: '#1a1a2e', weight: 11, opacity: 0.5, lineCap: 'round', lineJoin: 'round' }).addTo(group);
    L.polyline(coords, { color: '#3b00d1', weight: 8, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(group);
  } else {
    L.polyline(coords, { color: '#1a73e8', weight: 7, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(group);
  }
}

function navChevronIconHtml(heading?: number) {
  const rot = heading !== undefined ? heading : 0;
  return `
    <div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;">
      <div style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.85);box-shadow:0 2px 8px rgba(0,0,0,0.12);"></div>
      <svg width="24" height="24" viewBox="0 0 24 24" style="transform:rotate(${rot}deg);position:relative;z-index:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.15));">
        <path d="M12 2 L20 18 L14 14 L14 22 L10 22 L10 14 L4 18 Z" fill="#1a73e8" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
    </div>`;
}

function driverIconHtml(heading?: number) {
  const cone = heading !== undefined
    ? `<div style="position:absolute;top:-4px;left:50%;transform:translateX(-50%) rotate(${heading}deg);transform-origin:bottom center;">
        <svg width="14" height="16" viewBox="0 0 14 16">
          <path d="M7 0 L14 16 L7 11 L0 16 Z" fill="rgba(26,115,232,0.35)" />
        </svg>
      </div>`
    : '';
  return `
    <div style="position:relative;width:40px;height:40px">
      ${cone}
      <div style="position:absolute;inset:0;border-radius:50%;background:rgba(26,115,232,0.15);animation:pulse-ring 2s infinite"></div>
      <div style="position:absolute;inset:2px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 2px 8px rgba(26,115,232,0.4);z-index:1"></div>
    </div>`;
}

const startIconHtml = `<div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#fbbf24,#d97706);border:3px solid #fff;box-shadow:0 0 16px rgba(251,191,36,0.45),0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:#fff">S</div>`;
const endIconHtml = `<div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#f43f5e,#e11d48);border:3px solid #fff;box-shadow:0 0 16px rgba(244,63,94,0.45),0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:#fff">E</div>`;

function stopIconHtml(order: number, size: number, bg: string, pulse: boolean, glow: string) {
  const ring = pulse ? `<div style="position:absolute;inset:-6px;border-radius:50%;background:${glow};animation:pulse-ring 2s infinite;z-index:1"></div>` : '';
  const shadow = pulse ? `0 3px 14px ${glow}` : '0 2px 6px rgba(0,0,0,0.3)';
  const fontSize = size >= 32 ? 13 : size >= 28 ? 11 : 10;
  return `<div style="position:relative;width:${size}px;height:${size}px">${ring}<div style="position:absolute;inset:0;border-radius:50%;background:${bg};border:3px solid #fff;box-shadow:${shadow};display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:bold;color:#fff;z-index:2">${order}</div></div>`;
}

export default forwardRef<MapViewRef, MapViewProps>(function MapView({
  waypoints, customers = [], driverLocation, startLocation, endPoint, height = '100%', followDriver, onManualPan,
  nextStopId, arrivedStopId, completedIds, skippedIds, pendingCustomer, navigationMode,
}, ref) {
  const { t } = useI18n();
  const mt = t.map;
  const FOLLOW_ZOOM = 18;
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const staticGroupRef = useRef<L.LayerGroup | null>(null);
  const manualPanRef = useRef(false);
  const initialFitRef = useRef(true);
  const followEntryRef = useRef(true);

  useImperativeHandle(ref, () => ({
    recenter: (lat: number, lng: number) => {
      mapRef.current?.setView([lat, lng], FOLLOW_ZOOM, { animate: true });
      manualPanRef.current = false;
    }
  }), []);

  // Map creation (stable — runs once)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, zoom: 13 }).setView([32.0, 34.8], 10);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);
    const group = L.layerGroup().addTo(map);
    staticGroupRef.current = group;
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  // Event listeners (updatable — re-binds when onManualPan changes)
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const handler = () => { manualPanRef.current = true; onManualPan?.(); };
    m.on('dragstart', handler);
    m.on('zoomstart', handler);
    m.on('wheel', handler);
    return () => { m.off('dragstart', handler); m.off('zoomstart', handler); m.off('wheel', handler); };
  }, [onManualPan]);

  // Render stops (either route waypoints or pre-route customer markers) + polylines + fit bounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const group = staticGroupRef.current;
    if (!group) return;
    group.clearLayers();

    const bounds: [number, number][] = [];
    const sorted = [...waypoints].sort((a, b) => a.order - b.order);
    const cs = new Set(completedIds || []);
    const sk = new Set(skippedIds || []);

    if (driverLocation) {
      bounds.push([driverLocation.lat, driverLocation.lng]);
    }

    if (startLocation && !driverLocation) {
      const icon = L.divIcon({ html: startIconHtml, className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
      L.marker([startLocation.lat, startLocation.lng], { icon }).addTo(group).bindPopup(`<b>${mt.startLocation}</b>`);
      bounds.push([startLocation.lat, startLocation.lng]);
    }

    if (endPoint) {
      const icon = L.divIcon({ html: endIconHtml, className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
      L.marker([endPoint.location.lat, endPoint.location.lng], { icon, zIndexOffset: 200 }).addTo(group).bindPopup(`<b>${endPoint.label || 'End'}</b>`);
      bounds.push([endPoint.location.lat, endPoint.location.lng]);
    }

    if (pendingCustomer) {
      const icon = L.divIcon({
        html: `<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);border:3px solid #fff;box-shadow:0 0 24px rgba(245,158,11,0.6),0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:bold;color:#fff">+</div>`,
        className: '', iconSize: [36, 36], iconAnchor: [18, 18],
      });
      L.marker([pendingCustomer.location.lat, pendingCustomer.location.lng], { icon, zIndexOffset: 1000 })
        .addTo(group)
        .bindPopup(`<b>${pendingCustomer.address || 'New stop'}</b>`);
      bounds.push([pendingCustomer.location.lat, pendingCustomer.location.lng]);
      map.setView([pendingCustomer.location.lat, pendingCustomer.location.lng], 16, { animate: true });
    }

    if (sorted.length > 0) {
      // Route waypoints
      sorted.forEach((wp, i) => {
        const isDone = cs.has(wp.customer.id);
        const isSkipped = sk.has(wp.customer.id);
        const isNext = wp.customer.id === nextStopId;
        const isArrived = arrivedStopId === wp.customer.id;

        const stopTooltip = (!isDone && !isSkipped && !navigationMode) ? (wp.customer.name || wp.customer.address || '') : undefined;

        let icon: L.DivIcon;
        if (isDone) {
          icon = L.divIcon({ html: stopIconHtml(0, 24, '#9ca3af', false, ''), className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
        } else if (isSkipped) {
          icon = L.divIcon({ html: stopIconHtml(0, 24, '#6b7280', false, ''), className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
        } else if (isArrived) {
          icon = L.divIcon({ html: stopIconHtml(wp.order, 40, '#1a73e8', true, 'rgba(26,115,232,0.3)'), className: '', iconSize: [40, 40], iconAnchor: [20, 20] });
        } else if (isNext) {
          icon = L.divIcon({ html: stopIconHtml(wp.order, 34, '#1a73e8', true, 'rgba(26,115,232,0.25)'), className: '', iconSize: [34, 34], iconAnchor: [17, 17] });
        } else {
          icon = L.divIcon({ html: stopIconHtml(wp.order, 28, '#1a73e8', false, ''), className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
        }

        const marker = L.marker([wp.customer.location.lat, wp.customer.location.lng], { icon, zIndexOffset: isArrived ? 600 : isNext ? 500 : 0 })
          .addTo(group);
        if (stopTooltip) {
          marker.bindTooltip(stopTooltip, { permanent: true, direction: 'top', offset: [0, -4], className: 'stop-tooltip' });
        }
        bounds.push([wp.customer.location.lat, wp.customer.location.lng]);

        if (isDone || isSkipped) return;

        const isCurrentLeg = wp.customer.id === nextStopId;
        const prevWp = i === 0 ? null : sorted[i - 1];
        const prevIsBehind = prevWp ? (cs.has(prevWp.customer.id) || sk.has(prevWp.customer.id)) : true;
        if (prevIsBehind && !isCurrentLeg) return;

        let legCoords: [number, number][];
        if (wp.legGeometry && wp.legGeometry.length > 0) {
          legCoords = wp.legGeometry as [number, number][];
        } else {
          const from = prevWp ? prevWp.customer.location : (driverLocation || startLocation);
          if (!from) return;
          legCoords = [[from.lat, from.lng], [wp.customer.location.lat, wp.customer.location.lng]];
        }

        if (isCurrentLeg && driverLocation && legCoords.length > 1) {
          let closestIdx = 0;
          let minDist = Infinity;
          for (let j = 0; j < legCoords.length; j++) {
            const dLat = legCoords[j][0] - driverLocation.lat;
            const dLng = legCoords[j][1] - driverLocation.lng;
            const d = dLat * dLat + dLng * dLng;
            if (d < minDist) { minDist = d; closestIdx = j; }
          }
          legCoords = legCoords.slice(closestIdx);
        }

        addRoutePolyline(group, legCoords, navigationMode);

        // Turn arrows for current leg
        if (isCurrentLeg && wp.steps && wp.steps.length > 0) {
          const relevantSteps = wp.steps.filter(s => s.type !== 'continue');
          const maxSteps = Math.min(relevantSteps.length, 5);
          for (let si = 0; si < maxSteps; si++) {
            const step = relevantSteps[si];
            const opacity = Math.max(0.35, 1 - si * 0.15);
            const arrowIcon = L.divIcon({
              html: maneuverIconHtml(step.type, step.modifier, opacity),
              className: '', iconSize: [24, 24], iconAnchor: [12, 12],
            });
            const arrowMarker = L.marker([step.location.lat, step.location.lng], { icon: arrowIcon, zIndexOffset: 450 - si }).addTo(group);
            arrowMarker.bindTooltip(step.instruction, { permanent: true, direction: 'top', offset: [0, -2], className: 'turn-tooltip' });
          }
        }
      });
    } else if (customers.length > 0) {
      // Pre-route customer markers
      customers.forEach((c, i) => {
        const icon = L.divIcon({
          html: stopIconHtml(i + 1, 28, '#1a73e8', false, ''),
          className: '', iconSize: [28, 28], iconAnchor: [14, 14],
        });
        const custMarker = L.marker([c.location.lat, c.location.lng], { icon })
          .addTo(group);
        if (!navigationMode) {
          custMarker.bindTooltip(c.name || c.address || `${mt.stop} ${i + 1}`, { permanent: true, direction: 'top', offset: [0, -4], className: 'stop-tooltip' });
        }
        bounds.push([c.location.lat, c.location.lng]);
      });
    }

    if (bounds.length > 0 && !followDriver && !manualPanRef.current) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16, animate: true });
    }
  }, [waypoints, customers, startLocation, endPoint, mt, followDriver, nextStopId, arrivedStopId, completedIds, skippedIds, pendingCustomer]);

  // Reset manualPan when entering follow mode
  useEffect(() => {
    if (followDriver) {
      manualPanRef.current = false;
      followEntryRef.current = true;
    }
  }, [followDriver]);

  // Follow driver panning
  useEffect(() => {
    if (!followDriver || !driverLocation || !mapRef.current) return;
    if (manualPanRef.current) return;
    if (followEntryRef.current) {
      followEntryRef.current = false;
      mapRef.current.setView([driverLocation.lat, driverLocation.lng], FOLLOW_ZOOM, { animate: true, duration: 0.5 });
    } else {
      mapRef.current.panTo([driverLocation.lat, driverLocation.lng], { animate: true, duration: 0.5 });
    }
  }, [driverLocation, followDriver]);

  // Driver marker (blue dot with heading, or 3D chevron in navigation mode)
  useEffect(() => {
    if (!driverLocation) return;
    const map = mapRef.current;
    if (!map) return;

    const iconHtml = navigationMode ? navChevronIconHtml(driverLocation.heading) : driverIconHtml(driverLocation.heading);
    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng([driverLocation.lat, driverLocation.lng]);
      driverMarkerRef.current.setIcon(L.divIcon({
        html: iconHtml,
        className: '', iconSize: [44, 44], iconAnchor: [22, 22],
      }));
    } else {
      const icon = L.divIcon({
        html: iconHtml,
        className: '', iconSize: [44, 44], iconAnchor: [22, 22],
      });
      const marker = L.marker([driverLocation.lat, driverLocation.lng], { icon, zIndexOffset: 1000 }).addTo(map);
      driverMarkerRef.current = marker;
    }
  }, [driverLocation, navigationMode]);

  // Initial fit: when first driver location arrives, fit bounds to show everything
  useEffect(() => {
    if (!driverLocation || !mapRef.current) return;
    if (initialFitRef.current) {
      initialFitRef.current = false;
      if (followDriver) {
        mapRef.current.setView([driverLocation.lat, driverLocation.lng], FOLLOW_ZOOM, { animate: true, duration: 0.5 });
      } else {
        const allBounds: [number, number][] = [[driverLocation.lat, driverLocation.lng]];
        customers.forEach(c => allBounds.push([c.location.lat, c.location.lng]));
        waypoints.forEach(w => allBounds.push([w.customer.location.lat, w.customer.location.lng]));
        if (startLocation) allBounds.push([startLocation.lat, startLocation.lng]);
        if (allBounds.length > 1) {
          mapRef.current.fitBounds(allBounds, { padding: [60, 60], maxZoom: 16, animate: true });
        } else {
          mapRef.current.setView([driverLocation.lat, driverLocation.lng], FOLLOW_ZOOM, { animate: true });
        }
      }
      manualPanRef.current = false;
    }
  }, [driverLocation, waypoints, customers, startLocation, followDriver]);

  // Inject pulse-ring keyframes
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('map-pulse-style')) {
      const style = document.createElement('style');
      style.id = 'map-pulse-style';
      style.textContent = `@keyframes pulse-ring { 0% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.5); opacity: 0; } 100% { transform: scale(1); opacity: 0.5; } }`;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <div style={{ height, width: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
});
