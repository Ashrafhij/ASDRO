import { Location } from './types';

export async function getDriverLocation(): Promise<Location> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export function watchDriverLocation(onLocation: (loc: Location) => void, onError?: (err: GeolocationPositionError) => void): () => void {
  if (!navigator.geolocation) return () => {};
  const watchId = navigator.geolocation.watchPosition(
    (pos) => onLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    (err) => onError?.(err),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
  );
  return () => navigator.geolocation.clearWatch(watchId);
}
