import { Location } from './types';

export async function getDriverLocation(): Promise<Location> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading: pos.coords.heading ?? undefined,
      }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export function watchDriverLocation(onLocation: (loc: Location) => void, onError?: (err: GeolocationPositionError) => void): () => void {
  if (!navigator.geolocation) return () => {};
  const watchId = navigator.geolocation.watchPosition(
    (pos) => onLocation({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      heading: pos.coords.heading ?? undefined,
      speed: pos.coords.speed ?? undefined,
    }),
    (err) => onError?.(err),
    { enableHighAccuracy: true, timeout: 5000, maximumAge: 500 }
  );
  return () => navigator.geolocation.clearWatch(watchId);
}
