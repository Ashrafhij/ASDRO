'use client';

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Location, Waypoint } from '@/lib/types';
import { useI18n } from '@/lib/i18n-context';

export interface MapViewRef {
  recenter: (lat: number, lng: number) => void;
}

interface MapViewProps {
  waypoints: Waypoint[];
  driverLocation: Location | null;
  startLocation: Location | null;
  height?: string;
  followDriver?: boolean;
  onManualPan?: () => void;
  nextStopId?: string | null;
  completedIds?: Set<string>;
  skippedIds?: Set<string>;
}

function addRoutePolyline(group: L.LayerGroup, coords: [number, number][], weight: number, color: string, opacity: number, dashed: boolean) {
  const dashOpts = dashed ? { dashArray: '8,8' } : {};
  L.polyline(coords, { color: '#ffffff', weight: weight + 3, opacity: 0.1, ...dashOpts }).addTo(group);
  L.polyline(coords, { color: '#ffffff', weight: weight + 1, opacity: 0.25, ...dashOpts }).addTo(group);
  L.polyline(coords, { color, weight, opacity, ...dashOpts }).addTo(group);
}

const driverIconHtml = `
  <div style="position:relative;width:40px;height:40px">
    <div style="position:absolute;inset:-8px;border-radius:50%;background:rgba(59,130,246,0.15);animation:pulse-ring 2s infinite;z-index:1"></div>
    <div style="position:absolute;inset:-3px;border-radius:50%;background:rgba(59,130,246,0.3);z-index:2"></div>
    <div style="position:absolute;inset:2px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border:3px solid #fff;box-shadow:0 2px 12px rgba(37,99,235,0.6);display:flex;align-items:center;justify-content:center;z-index:3">
      <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:#fff"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
    </div>
  </div>`;

const startIconHtml = `<div style="width:28px;height:28px;border-radius:50%;background:#f59e0b;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:#fff">S</div>`;

function stopIconHtml(order: number, size: number, bg: string, pulse: boolean, glow: string) {
  const ring = pulse ? `<div style="position:absolute;inset:-6px;border-radius:50%;background:${glow};animation:pulse-ring 2s infinite;z-index:1"></div>` : '';
  const shadow = pulse ? `0 3px 14px ${glow}` : '0 2px 6px rgba(0,0,0,0.3)';
  const fontSize = size >= 32 ? 13 : size >= 28 ? 11 : 10;
  return `<div style="position:relative;width:${size}px;height:${size}px">${ring}<div style="position:absolute;inset:0;border-radius:50%;background:${bg};border:3px solid #fff;box-shadow:${shadow};display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:bold;color:#fff;z-index:2">${order}</div></div>`;
}

export default forwardRef<MapViewRef, MapViewProps>(function MapView({
  waypoints, driverLocation, startLocation, height = '100%', followDriver, onManualPan,
  nextStopId, completedIds, skippedIds,
}, ref) {
  const { t } = useI18n();
  const mt = t.map;
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const staticGroupRef = useRef<L.LayerGroup | null>(null);
  const manualPanRef = useRef(false);

  useImperativeHandle(ref, () => ({
    recenter: (lat: number, lng: number) => {
      mapRef.current?.setView([lat, lng], 16, { animate: true });
      manualPanRef.current = false;
    }
  }), []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, zoom: 13 }).setView([32.0, 34.8], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    map.on('dragstart', () => { manualPanRef.current = true; onManualPan?.(); });
    map.on('zoomstart', () => { manualPanRef.current = true; onManualPan?.(); });
    const group = L.layerGroup().addTo(map);
    staticGroupRef.current = group;
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; };
  }, [onManualPan]);

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

    sorted.forEach((wp, i) => {
      const isDone = cs.has(wp.customer.id);
      const isSkipped = sk.has(wp.customer.id);
      const isNext = wp.customer.id === nextStopId;

      let icon: L.DivIcon;
      if (isDone) {
        icon = L.divIcon({ html: stopIconHtml(0, 26, '#6b7280', false, ''), className: '', iconSize: [26, 26], iconAnchor: [13, 13] });
      } else if (isSkipped) {
        icon = L.divIcon({ html: stopIconHtml(0, 26, '#4b5563', false, ''), className: '', iconSize: [26, 26], iconAnchor: [13, 13] });
      } else if (isNext) {
        icon = L.divIcon({ html: stopIconHtml(wp.order, 38, 'linear-gradient(135deg,#f59e0b,#d97706)', true, 'rgba(245,158,11,0.3)'), className: '', iconSize: [38, 38], iconAnchor: [19, 19] });
      } else {
        icon = L.divIcon({ html: stopIconHtml(wp.order, 30, 'linear-gradient(135deg,#10b981,#059669)', false, ''), className: '', iconSize: [30, 30], iconAnchor: [15, 15] });
      }

      L.marker([wp.customer.location.lat, wp.customer.location.lng], { icon, zIndexOffset: isNext ? 500 : 0 })
        .addTo(group)
        .bindPopup(`<b>${mt.stop} ${wp.order}: ${wp.customer.name}</b><br/>${mt.estArrival}: ${wp.estimatedArrival}`);
      bounds.push([wp.customer.location.lat, wp.customer.location.lng]);

      if (isDone || isSkipped) return;

      const polyWeight = followDriver ? 6 : 4;
      const polyColor = followDriver ? '#60a5fa' : '#3b82f6';
      const polyOpacity = 0.9;

      if (wp.legGeometry && wp.legGeometry.length > 0) {
        addRoutePolyline(group, wp.legGeometry as [number, number][], polyWeight, polyColor, polyOpacity, false);
      } else {
        const prev = i === 0 ? (driverLocation || startLocation) : sorted[i - 1].customer.location;
        if (prev && !cs.has(sorted[i - 1]?.customer.id) && !sk.has(sorted[i - 1]?.customer.id)) {
          addRoutePolyline(group, [[prev.lat, prev.lng], [wp.customer.location.lat, wp.customer.location.lng]], polyWeight, polyColor, polyOpacity, false);
        }
      }
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16, animate: true });
    }
  }, [waypoints, startLocation, mt, followDriver, nextStopId, completedIds, skippedIds]);

  useEffect(() => {
    if (!followDriver || !driverLocation || !mapRef.current) return;
    if (manualPanRef.current) return;
    mapRef.current.panTo([driverLocation.lat, driverLocation.lng], { animate: true, duration: 0.5 });
  }, [driverLocation, followDriver]);

  useEffect(() => {
    if (!driverLocation) return;
    const map = mapRef.current;
    if (!map) return;

    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng([driverLocation.lat, driverLocation.lng]);
    } else {
      const icon = L.divIcon({ html: driverIconHtml, className: '', iconSize: [40, 40], iconAnchor: [20, 20] });
      const marker = L.marker([driverLocation.lat, driverLocation.lng], { icon, zIndexOffset: 1000 }).addTo(map);
      driverMarkerRef.current = marker;
    }
  }, [driverLocation]);

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
