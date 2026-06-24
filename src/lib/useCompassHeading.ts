'use client';

import { useState, useEffect } from 'react';

export function useCompassHeading(): number | undefined {
  const [heading, setHeading] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let granted = true;
    const handler = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null && e.alpha !== undefined) {
        setHeading(e.alpha);
      }
    };

    const startListening = () => {
      window.addEventListener('deviceorientation', handler);
    };

    const req = (DeviceOrientationEvent as any).requestPermission;
    if (typeof req === 'function') {
      req().then((state: string) => {
        granted = state === 'granted';
        if (granted) startListening();
      }).catch(() => startListening());
    } else {
      startListening();
    }

    return () => {
      window.removeEventListener('deviceorientation', handler);
    };
  }, []);

  return heading;
}
