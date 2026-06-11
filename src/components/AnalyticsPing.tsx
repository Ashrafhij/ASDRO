'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { collectDeviceInfo } from '@/lib/analytics';

export default function AnalyticsPing() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === '/dashboard' || pathname.startsWith('/api/')) return;
    const info = collectDeviceInfo(pathname);
    fetch('/api/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(info),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
