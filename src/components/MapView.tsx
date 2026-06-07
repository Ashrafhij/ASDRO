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
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([20, 0], 2);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(mapRef.current);

      L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current);
      L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(mapRef.current);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const toRemove: L.Layer[] = [];
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) toRemove.push(layer);
    });
    toRemove.forEach(l => map.removeLayer(l));

    const markers: [number, number][] = [];

    // Driver marker
    if (driverLocation) {
      const pulseIcon = L.divIcon({
        html: `<div style="position:relative">
          <div style="position:absolute;inset:-6px;border-radius:50%;background:rgba(37,99,235,0.2);animation:pulse 2s ease-in-out infinite"></div>
          <div style="width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#1d4ed8);display:flex;align-items:center;justify-content:center;border:2.5px solid white;box-shadow:0 2px 8px rgba(37,99,235,0.4);font-size:10px;font-weight:bold;color:white">D</div>
        </div>`,
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      L.marker([driverLocation.lat, driverLocation.lng], { icon: pulseIcon, zIndexOffset: 1000 })
        .addTo(map).bindPopup(`<b>${mt.yourLocation}</b>`);
      markers.push([driverLocation.lat, driverLocation.lng]);
    }

    // Start marker
    if (startLocation && !driverLocation) {
      const icon = L.divIcon({
        html: `<div style="width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;border:2.5px solid white;box-shadow:0 2px 8px rgba(245,158,11,0.4);font-size:11px;font-weight:bold;color:white">S</div>`,
        className: '', iconSize: [24, 24], iconAnchor: [12, 12],
      });
      L.marker([startLocation.lat, startLocation.lng], { icon, zIndexOffset: 1000 })
        .addTo(map).bindPopup(`<b>${mt.startLocation}</b>`);
      markers.push([startLocation.lat, startLocation.lng]);
    }

    // Stop markers
    const ordered = [...waypoints].sort((a, b) => a.order - b.order);
    ordered.forEach((wp) => {
      const color = '#10b981';
      const icon = L.divIcon({
        html: `<div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,${color},#059669);display:flex;align-items:center;justify-content:center;border:2.5px solid white;box-shadow:0 2px 8px rgba(16,185,129,0.4);font-size:11px;font-weight:bold;color:white">${wp.order}</div>`,
        className: '', iconSize: [26, 26], iconAnchor: [13, 13],
      });
      L.marker([wp.customer.location.lat, wp.customer.location.lng], { icon })
        .addTo(map)
        .bindPopup(`
          <b>${mt.stop} ${wp.order}: ${wp.customer.name}</b><br/>
          ${wp.customer.address}<br/>
          ${mt.estArrival}: ${wp.estimatedArrival}
        `);
      markers.push([wp.customer.location.lat, wp.customer.location.lng]);
    });

    if (markers.length > 0) {
      map.fitBounds(markers, { padding: [60, 60], maxZoom: 15 });
    }

    // Polyline
    const pts: [number, number][] = [];
    if (driverLocation) pts.push([driverLocation.lat, driverLocation.lng]);
    else if (startLocation) pts.push([startLocation.lat, startLocation.lng]);
    ordered.forEach(wp => pts.push([wp.customer.location.lat, wp.customer.location.lng]));
    if (pts.length >= 2) {
      L.polyline(pts, { color: '#3b82f6', weight: 4, opacity: 0.6 }).addTo(map);
      L.polyline(pts, { color: '#3b82f6', weight: 2, opacity: 0.3, dashArray: '8, 8' }).addTo(map);
    }
  }, [waypoints, driverLocation, startLocation, mt]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />
      {/* Inline keyframe for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
