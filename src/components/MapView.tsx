'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Location, Waypoint } from '@/lib/types';

interface MapViewProps {
  waypoints: Waypoint[];
  driverLocation: Location | null;
  startLocation: Location | null;
  height?: string;
}

export default function MapView({ waypoints, driverLocation, startLocation, height = '400px' }: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current).setView([20, 0], 2);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(mapRef.current);
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

    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    const markers: [number, number][] = [];

    if (driverLocation) {
      const icon = L.divIcon({
        html: `<div style="background:#2563eb;color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">D</div>`,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([driverLocation.lat, driverLocation.lng], { icon })
        .addTo(map)
        .bindPopup('<b>Your Location</b>');
      markers.push([driverLocation.lat, driverLocation.lng]);
    }

    if (startLocation && !driverLocation) {
      const icon = L.divIcon({
        html: `<div style="background:#f59e0b;color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">S</div>`,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([startLocation.lat, startLocation.lng], { icon })
        .addTo(map)
        .bindPopup('<b>Start Location</b>');
      markers.push([startLocation.lat, startLocation.lng]);
    }

    const orderedStops = [...waypoints].sort((a, b) => a.order - b.order);

    orderedStops.forEach((wp) => {
      const icon = L.divIcon({
        html: `<div style="background:#10b981;color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${wp.order}</div>`,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([wp.customer.location.lat, wp.customer.location.lng], { icon })
        .addTo(map)
        .bindPopup(`
          <b>Stop ${wp.order}: ${wp.customer.name}</b><br/>
          ${wp.customer.address}<br/>
          Est. arrival: ${wp.estimatedArrival}<br/>
          ${wp.customer.phone ? `Phone: ${wp.customer.phone}` : ''}
        `);
      markers.push([wp.customer.location.lat, wp.customer.location.lng]);
    });

    if (markers.length > 0) {
      map.fitBounds(markers, { padding: [50, 50] });
    }

    const points: [number, number][] = [];

    if (driverLocation) {
      points.push([driverLocation.lat, driverLocation.lng]);
    } else if (startLocation) {
      points.push([startLocation.lat, startLocation.lng]);
    }

    orderedStops.forEach((wp) => {
      points.push([wp.customer.location.lat, wp.customer.location.lng]);
    });

    if (points.length >= 2) {
      L.polyline(points, {
        color: '#2563eb',
        weight: 3,
        opacity: 0.7,
        dashArray: '10, 10',
      }).addTo(map);
    }
  }, [waypoints, driverLocation, startLocation]);

  return <div ref={mapContainerRef} style={{ height, width: '100%', borderRadius: '0.5rem', zIndex: 0 }} />;
}
