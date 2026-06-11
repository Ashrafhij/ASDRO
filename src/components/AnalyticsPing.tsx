'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { collectDeviceInfo, startSession, endSession } from '@/lib/analytics';

export default function AnalyticsPing() {
  const pathname = usePathname();
  const prevPath = useRef(pathname);

  useEffect(() => {
    if (pathname === '/dashboard' || pathname.startsWith('/api/')) return;
    const info = collectDeviceInfo(pathname);
    fetch('/api/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(info),
      keepalive: true,
    }).catch(() => {});
    startSession();
  }, [pathname]);

  useEffect(() => {
    const handleUnload = () => endSession();
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      if (prevPath.current !== pathname) return; // navigation, not unmount
      endSession();
    };
  }, [pathname]);

  return null;
}
