'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Location, Waypoint } from '@/lib/types';
import { useI18n } from '@/lib/i18n-context';

interface MapViewProps {
  waypoints: Waypoint[];
  driverLocation: Location | null;
  startLocation: Location | null;
  height?: string;
}

export default function MapView({ waypoints, driverLocation, startLocation, height = '100%' }: MapViewProps) {
  const { t } = useI18n();
  const mt = t.map;
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const layers: L.Layer[] = [];
    map.eachLayer(l => { if (l instanceof L.Marker || l instanceof L.Polyline) layers.push(l); });
    layers.forEach(l => map.removeLayer(l));

    const points: [number, number][] = [];

    if (driverLocation) {
      const icon = L.divIcon({
        html: '<div style="width:22px;height:22px;border-radius:50%;background:#2563eb;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:#fff">D</div>',
        className: '', iconSize: [22, 22], iconAnchor: [11, 11],
      });
      L.marker([driverLocation.lat, driverLocation.lng], { icon }).addTo(map).bindPopup(`<b>${mt.yourLocation}</b>`);
      points.push([driverLocation.lat, driverLocation.lng]);
    }

    if (startLocation && !driverLocation) {
      const icon = L.divIcon({
        html: '<div style="width:22px;height:22px;border-radius:50%;background:#f59e0b;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:#fff">S</div>',
        className: '', iconSize: [22, 22], iconAnchor: [11, 11],
      });
      L.marker([startLocation.lat, startLocation.lng], { icon }).addTo(map).bindPopup(`<b>${mt.startLocation}</b>`);
      points.push([startLocation.lat, startLocation.lng]);
    }

    const ordered = [...waypoints].sort((a, b) => a.order - b.order);
    ordered.forEach((wp) => {
      const icon = L.divIcon({
        html: `<div style="width:24px;height:24px;border-radius:50%;background:#10b981;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;color:#fff">${wp.order}</div>`,
        className: '', iconSize: [24, 24], iconAnchor: [12, 12],
      });
      L.marker([wp.customer.location.lat, wp.customer.location.lng], { icon })
        .addTo(map)
        .bindPopup(`<b>${mt.stop} ${wp.order}: ${wp.customer.name}</b><br/>${mt.estArrival}: ${wp.estimatedArrival}`);
      points.push([wp.customer.location.lat, wp.customer.location.lng]);
    });

    if (points.length > 0) map.fitBounds(points, { padding: [50, 50], maxZoom: 14 });

    if (points.length >= 2) {
      L.polyline(points, { color: '#3b82f6', weight: 3, opacity: 0.6 }).addTo(map);
    }
  }, [waypoints, driverLocation, startLocation, mt]);

  return <div ref={containerRef} style={{ height, width: '100%' }} />;
}
