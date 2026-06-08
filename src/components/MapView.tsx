'use client';

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
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

export default forwardRef<MapViewRef, MapViewProps>(function MapView({ waypoints, driverLocation, startLocation, height = '100%', followDriver, onManualPan }, ref) {
  const { t } = useI18n();
  const mt = t.map;
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const manualPanRef = useRef(false);

  useImperativeHandle(ref, () => ({
    recenter: (lat: number, lng: number) => {
      mapRef.current?.setView([lat, lng], 16, { animate: true });
      manualPanRef.current = false;
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

  // Static layers: stops, route polylines, start marker
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
      const icon = L.divIcon({
        html: '<div style="width:22px;height:22px;border-radius:50%;background:#f59e0b;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:#fff">S</div>',
        className: '', iconSize: [22, 22], iconAnchor: [11, 11],
      });
      L.marker([startLocation.lat, startLocation.lng], { icon }).addTo(map).bindPopup(`<b>${mt.startLocation}</b>`);
      bounds.push([startLocation.lat, startLocation.lng]);
    }

    sorted.forEach((wp, i) => {
      const icon = L.divIcon({
        html: `<div style="width:24px;height:24px;border-radius:50%;background:#10b981;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;color:#fff">${wp.order}</div>`,
        className: '', iconSize: [24, 24], iconAnchor: [12, 12],
      });
      L.marker([wp.customer.location.lat, wp.customer.location.lng], { icon })
        .addTo(map)
        .bindPopup(`<b>${mt.stop} ${wp.order}: ${wp.customer.name}</b><br/>${mt.estArrival}: ${wp.estimatedArrival}`);
      bounds.push([wp.customer.location.lat, wp.customer.location.lng]);

      if (wp.legGeometry && wp.legGeometry.length > 0) {
        L.polyline(wp.legGeometry as [number, number][], {
          color: '#3b82f6', weight: 3, opacity: 0.7,
        }).addTo(map);
      } else {
        const prev = i === 0
          ? (driverLocation || startLocation)
          : sorted[i - 1].customer.location;
        if (prev) {
          L.polyline(
            [[prev.lat, prev.lng], [wp.customer.location.lat, wp.customer.location.lng]],
            { color: '#3b82f6', weight: 3, opacity: 0.4, dashArray: '6,6' }
          ).addTo(map);
        }
      }
    });

    if (followDriver && driverLocation) {
      map.setView([driverLocation.lat, driverLocation.lng], 16);
    } else if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [waypoints, startLocation, mt, followDriver]);

  // Follow driver — pans the map to keep driver centered
  useEffect(() => {
    if (!followDriver || !driverLocation || !mapRef.current) return;
    if (manualPanRef.current) return;
    mapRef.current.setView([driverLocation.lat, driverLocation.lng], undefined, { animate: true });
  }, [driverLocation, followDriver]);

  // Live driver marker
  useEffect(() => {
    if (!driverLocation) return;
    const map = mapRef.current;
    if (!map) return;

    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng([driverLocation.lat, driverLocation.lng]);
    } else {
      const icon = L.divIcon({
        html: '<div style="width:22px;height:22px;border-radius:50%;background:#2563eb;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:#fff">D</div>',
        className: '', iconSize: [22, 22], iconAnchor: [11, 11],
      });
      const marker = L.marker([driverLocation.lat, driverLocation.lng], { icon }).addTo(map).bindPopup(`<b>${mt.yourLocation}</b>`);
      driverMarkerRef.current = marker;
    }
  }, [driverLocation, mt]);

  return (
    <div style={{ height, width: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
});
