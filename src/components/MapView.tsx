'use client';

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Location, Waypoint, Customer } from '@/lib/types';
import { useI18n } from '@/lib/i18n-context';

export interface MapViewRef {
  recenter: (lat: number, lng: number) => void;
}

interface MapViewProps {
  waypoints: Waypoint[];
  customers?: Customer[];
  driverLocation: Location | null;
  startLocation: Location | null;
  height?: string;
  followDriver?: boolean;
  onManualPan?: () => void;
  nextStopId?: string | null;
  arrivedStopId?: string | null;
  completedIds?: Set<string>;
  skippedIds?: Set<string>;
  pendingCustomer?: Customer | null;
}

function addRoutePolyline(group: L.LayerGroup, coords: [number, number][]) {
  L.polyline(coords, { color: '#4338ca', weight: 14, opacity: 0.2, lineCap: 'round', lineJoin: 'round' }).addTo(group);
  L.polyline(coords, { color: '#6366f1', weight: 8, opacity: 0.5, lineCap: 'round', lineJoin: 'round' }).addTo(group);
  L.polyline(coords, { color: '#a5b4fc', weight: 4, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(group);
}

function driverIconHtml(heading?: number) {
  const rotation = heading !== undefined ? `rotate(${heading}deg)` : '';
  return `
    <div style="position:relative;width:44px;height:44px;transform:${rotation};transform-origin:center center;transition:transform 0.15s ease-out">
      <svg width="44" height="44" viewBox="0 0 44 44" style="filter:drop-shadow(0 2px 12px rgba(45,212,191,0.5))">
        <defs>
          <linearGradient id="diamGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#2dd4bf" />
            <stop offset="100%" stop-color="#0d9488" />
          </linearGradient>
        </defs>
        <path d="M22 2 C22 2 44 22 44 22 C44 22 22 42 22 42 C22 42 0 22 0 22 C0 22 22 2 22 2 Z"
              fill="url(#diamGrad)" stroke="#134e4a" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M22 8 C22 8 36 22 36 22 C36 22 22 36 22 36 C22 36 8 22 8 22 C8 22 22 8 22 8 Z"
              fill="#5eead4" opacity="0.25"/>
        <circle cx="22" cy="22" r="5" fill="#ccfbf1" opacity="0.9"/>
      </svg>
    </div>`;
}

const startIconHtml = `<div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#fbbf24,#d97706);border:3px solid #fff;box-shadow:0 0 16px rgba(251,191,36,0.45),0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:#fff">S</div>`;

function stopIconHtml(order: number, size: number, bg: string, pulse: boolean, glow: string) {
  const ring = pulse ? `<div style="position:absolute;inset:-6px;border-radius:50%;background:${glow};animation:pulse-ring 2s infinite;z-index:1"></div>` : '';
  const shadow = pulse ? `0 3px 14px ${glow}` : '0 2px 6px rgba(0,0,0,0.3)';
  const fontSize = size >= 32 ? 13 : size >= 28 ? 11 : 10;
  return `<div style="position:relative;width:${size}px;height:${size}px">${ring}<div style="position:absolute;inset:0;border-radius:50%;background:${bg};border:3px solid #fff;box-shadow:${shadow};display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:bold;color:#fff;z-index:2">${order}</div></div>`;
}

export default forwardRef<MapViewRef, MapViewProps>(function MapView({
  waypoints, customers = [], driverLocation, startLocation, height = '100%', followDriver, onManualPan,
  nextStopId, arrivedStopId, completedIds, skippedIds, pendingCustomer,
}, ref) {
  const { t } = useI18n();
  const mt = t.map;
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const staticGroupRef = useRef<L.LayerGroup | null>(null);
  const manualPanRef = useRef(false);
  const initialFitRef = useRef(true);
  const followEntryRef = useRef(true);

  useImperativeHandle(ref, () => ({
    recenter: (lat: number, lng: number) => {
      mapRef.current?.setView([lat, lng], 16, { animate: true });
      manualPanRef.current = false;
    }
  }), []);

  // Map creation (stable — runs once)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, zoom: 13 }).setView([32.0, 34.8], 10);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
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

        const stopTooltip = (!isDone && !isSkipped) ? (wp.customer.name || wp.customer.address || '') : undefined;

        let icon: L.DivIcon;
        if (isDone) {
          icon = L.divIcon({ html: stopIconHtml(0, 24, '#374151', false, ''), className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
        } else if (isSkipped) {
          icon = L.divIcon({ html: stopIconHtml(0, 24, '#1f2937', false, ''), className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
        } else if (isArrived) {
          icon = L.divIcon({ html: stopIconHtml(wp.order, 40, 'linear-gradient(135deg,#34d399,#059669)', true, 'rgba(52,211,153,0.35)'), className: '', iconSize: [40, 40], iconAnchor: [20, 20] });
        } else if (isNext) {
          icon = L.divIcon({ html: stopIconHtml(wp.order, 34, 'linear-gradient(135deg,#fbbf24,#d97706)', true, 'rgba(251,191,36,0.3)'), className: '', iconSize: [34, 34], iconAnchor: [17, 17] });
        } else {
          icon = L.divIcon({ html: stopIconHtml(wp.order, 28, 'linear-gradient(135deg,#6366f1,#4f46e5)', false, ''), className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
        }

        const marker = L.marker([wp.customer.location.lat, wp.customer.location.lng], { icon, zIndexOffset: isArrived ? 600 : isNext ? 500 : 0 })
          .addTo(group);
        if (stopTooltip) {
          marker.bindTooltip(stopTooltip, { permanent: true, direction: 'top', offset: [0, -4], className: 'stop-tooltip' });
        }
        bounds.push([wp.customer.location.lat, wp.customer.location.lng]);

        if (isDone || isSkipped) return;

        if (wp.legGeometry && wp.legGeometry.length > 0) {
          addRoutePolyline(group, wp.legGeometry as [number, number][]);
        } else {
          const prev = i === 0 ? (driverLocation || startLocation) : sorted[i - 1].customer.location;
          if (prev && !cs.has(sorted[i - 1]?.customer.id) && !sk.has(sorted[i - 1]?.customer.id)) {
            addRoutePolyline(group, [[prev.lat, prev.lng], [wp.customer.location.lat, wp.customer.location.lng]]);
          }
        }
      });
    } else if (customers.length > 0) {
      // Pre-route customer markers
      customers.forEach((c, i) => {
        const icon = L.divIcon({
          html: stopIconHtml(i + 1, 28, 'linear-gradient(135deg,#6366f1,#4f46e5)', false, ''),
          className: '', iconSize: [28, 28], iconAnchor: [14, 14],
        });
        L.marker([c.location.lat, c.location.lng], { icon })
          .addTo(group)
          .bindTooltip(c.name || c.address || `${mt.stop} ${i + 1}`, { permanent: true, direction: 'top', offset: [0, -4], className: 'stop-tooltip' });
        bounds.push([c.location.lat, c.location.lng]);
      });
    }

    if (bounds.length > 0 && !followDriver && !manualPanRef.current) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16, animate: true });
    }
  }, [waypoints, customers, startLocation, mt, followDriver, nextStopId, arrivedStopId, completedIds, skippedIds, pendingCustomer]);

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
      mapRef.current.setView([driverLocation.lat, driverLocation.lng], 16, { animate: true, duration: 0.5 });
    } else {
      mapRef.current.panTo([driverLocation.lat, driverLocation.lng], { animate: true, duration: 0.5 });
    }
  }, [driverLocation, followDriver]);

  // Driver marker (blue dot with heading)
  useEffect(() => {
    if (!driverLocation) return;
    const map = mapRef.current;
    if (!map) return;

    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng([driverLocation.lat, driverLocation.lng]);
      driverMarkerRef.current.setIcon(L.divIcon({
        html: driverIconHtml(driverLocation.heading),
        className: '', iconSize: [44, 44], iconAnchor: [22, 22],
      }));
    } else {
      const icon = L.divIcon({
        html: driverIconHtml(driverLocation.heading),
        className: '', iconSize: [44, 44], iconAnchor: [22, 22],
      });
      const marker = L.marker([driverLocation.lat, driverLocation.lng], { icon, zIndexOffset: 1000 }).addTo(map);
      driverMarkerRef.current = marker;
    }
  }, [driverLocation]);

  // Initial fit: when first driver location arrives, fit bounds to show everything
  useEffect(() => {
    if (!driverLocation || !mapRef.current) return;
    if (initialFitRef.current) {
      initialFitRef.current = false;
      const allBounds: [number, number][] = [[driverLocation.lat, driverLocation.lng]];
      customers.forEach(c => allBounds.push([c.location.lat, c.location.lng]));
      waypoints.forEach(w => allBounds.push([w.customer.location.lat, w.customer.location.lng]));
      if (startLocation) allBounds.push([startLocation.lat, startLocation.lng]);
      if (allBounds.length > 1) {
        mapRef.current.fitBounds(allBounds, { padding: [60, 60], maxZoom: 16, animate: true });
      } else {
        mapRef.current.setView([driverLocation.lat, driverLocation.lng], 15, { animate: true });
      }
    }
  }, [driverLocation, waypoints, customers, startLocation]);

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
