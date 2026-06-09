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
}

const driverIconHtml = `
  <div style="position:relative;width:36px;height:36px">
    <div style="position:absolute;inset:0;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border:3px solid #fff;box-shadow:0 2px 12px rgba(37,99,235,0.6);display:flex;align-items:center;justify-content:center;z-index:2">
      <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:#fff"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
    </div>
    <div style="position:absolute;inset:-6px;border-radius:50%;background:rgba(59,130,246,0.25);animation:pulse-ring 2s infinite;z-index:1"></div>
  </div>`;

const startIconHtml = `<div style="width:22px;height:22px;border-radius:50%;background:#f59e0b;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:#fff">S</div>`;

function stopIconHtml(order: number, isNext: boolean) {
  if (isNext) {
    return `<div style="position:relative;width:34px;height:34px"><div style="position:absolute;inset:0;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);border:3px solid #fff;box-shadow:0 2px 10px rgba(245,158,11,0.5);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;color:#fff;z-index:2">${order}</div><div style="position:absolute;inset:-4px;border-radius:50%;background:rgba(245,158,11,0.2);animation:pulse-ring 2s infinite;z-index:1"></div></div>`;
  }
  return `<div style="width:24px;height:24px;border-radius:50%;background:#10b981;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;color:#fff">${order}</div>`;
}

export default forwardRef<MapViewRef, MapViewProps>(function MapView({ waypoints, driverLocation, startLocation, height = '100%', followDriver, onManualPan }, ref) {
  const { t } = useI18n();
  const mt = t.map;
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const manualPanRef = useRef(false);
  const hasFittedNavRef = useRef(false);

  useImperativeHandle(ref, () => ({
    recenter: (lat: number, lng: number) => {
      mapRef.current?.setView([lat, lng], 16, { animate: true });
      manualPanRef.current = false;
      hasFittedNavRef.current = false;
    }
  }), []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, zoom: 16 }).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    map.on('dragstart', () => { manualPanRef.current = true; onManualPan?.(); });
    map.on('zoomstart', () => { manualPanRef.current = true; onManualPan?.(); });
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; };
  }, [onManualPan]);

  // Static layers: stops, start marker, route polylines
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.eachLayer(l => {
      if (!(l instanceof L.TileLayer)) map.removeLayer(l);
    });

    const bounds: [number, number][] = [];
    const sorted = [...waypoints].sort((a, b) => a.order - b.order);

    if (driverLocation) {
      bounds.push([driverLocation.lat, driverLocation.lng]);
    }
    if (startLocation && !driverLocation) {
      const icon = L.divIcon({ html: startIconHtml, className: '', iconSize: [22, 22], iconAnchor: [11, 11] });
      L.marker([startLocation.lat, startLocation.lng], { icon }).addTo(map).bindPopup(`<b>${mt.startLocation}</b>`);
      bounds.push([startLocation.lat, startLocation.lng]);
    }

    sorted.forEach((wp, i) => {
      const isNext = !!(followDriver && driverLocation && i === 0);
      const icon = L.divIcon({
        html: stopIconHtml(wp.order, isNext),
        className: '', iconSize: isNext ? [34, 34] : [24, 24], iconAnchor: isNext ? [17, 17] : [12, 12],
      });
      L.marker([wp.customer.location.lat, wp.customer.location.lng], { icon })
        .addTo(map)
        .bindPopup(`<b>${mt.stop} ${wp.order}: ${wp.customer.name}</b><br/>${mt.estArrival}: ${wp.estimatedArrival}`);
      bounds.push([wp.customer.location.lat, wp.customer.location.lng]);

      const polyWeight = followDriver ? 5 : 3;
      const polyOpacity = followDriver ? 0.9 : 0.7;
      const polyColor = followDriver ? '#60a5fa' : '#3b82f6';

      if (wp.legGeometry && wp.legGeometry.length > 0) {
        L.polyline(wp.legGeometry as [number, number][], {
          color: polyColor, weight: polyWeight, opacity: polyOpacity,
        }).addTo(map);
      } else {
        const prev = i === 0 ? (driverLocation || startLocation) : sorted[i - 1].customer.location;
        if (prev) {
          L.polyline(
            [[prev.lat, prev.lng], [wp.customer.location.lat, wp.customer.location.lng]],
            { color: polyColor, weight: polyWeight, opacity: followDriver ? 0.6 : 0.4, dashArray: followDriver ? '' : '6,6' }
          ).addTo(map);
        }
      }
    });

    // Initial fit
    if (followDriver && driverLocation && sorted.length > 0) {
      const nextBounds = L.latLngBounds([
        [driverLocation.lat, driverLocation.lng],
        [sorted[0].customer.location.lat, sorted[0].customer.location.lng]
      ]);
      map.fitBounds(nextBounds, { padding: [80, 80], maxZoom: 15 });
      hasFittedNavRef.current = true;
    } else if (!followDriver && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [waypoints, startLocation, mt, followDriver]);

  // Follow driver — pans map only if not manually panned
  useEffect(() => {
    if (!followDriver || !driverLocation || !mapRef.current) return;
    if (manualPanRef.current) return;
    mapRef.current.panTo([driverLocation.lat, driverLocation.lng], { animate: true, duration: 0.5 });
  }, [driverLocation, followDriver]);

  // Live driver marker
  useEffect(() => {
    if (!driverLocation) return;
    const map = mapRef.current;
    if (!map) return;

    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng([driverLocation.lat, driverLocation.lng]);
    } else {
      const icon = L.divIcon({ html: driverIconHtml, className: '', iconSize: [36, 36], iconAnchor: [18, 18] });
      const marker = L.marker([driverLocation.lat, driverLocation.lng], { icon, zIndexOffset: 1000 }).addTo(map);
      driverMarkerRef.current = marker;
    }
  }, [driverLocation]);

  // Inject pulse keyframes once
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
