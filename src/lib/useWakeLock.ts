'use client';

import { useEffect, useRef } from 'react';

export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    const request = async () => {
      if (!('wakeLock' in navigator)) return;
      try {
        sentinelRef.current?.release();
        sentinelRef.current = await navigator.wakeLock.request('screen');
      } catch { /* not supported or denied */ }
    };

    const release = async () => {
      try { await sentinelRef.current?.release(); } catch { /* already released */ }
      sentinelRef.current = null;
    };

    if (active) {
      request();
      const handleVisibility = () => { if (document.visibilityState === 'visible') request(); };
      document.addEventListener('visibilitychange', handleVisibility);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        release();
      };
    } else {
      release();
    }
  }, [active]);
}
