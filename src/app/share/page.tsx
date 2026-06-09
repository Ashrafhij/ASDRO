'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { parseWhatsAppLocation } from '@/lib/geocoding';

function ShareHandler() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const text = searchParams.get('text') || searchParams.get('url') || '';
    if (text) {
      const location = parseWhatsAppLocation(text);
      if (location) {
        sessionStorage.setItem('asdro-share-location', JSON.stringify({ location, text }));
      }
    }
    window.location.replace('/');
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
      </div>
    }>
      <ShareHandler />
    </Suspense>
  );
}
