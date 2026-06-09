'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Location } from './types';
import { parseWhatsAppLocation } from './geocoding';

export function useClipboardDetection() {
  const [detected, setDetected] = useState<{ location: Location; text: string } | null>(null);
  const lastTextRef = useRef('');

  const dismiss = useCallback(() => {
    setDetected(null);
  }, []);

  useEffect(() => {
    const check = async () => {
      try {
        if (!navigator.clipboard || !navigator.clipboard.readText) return;
        const text = await navigator.clipboard.readText();
        if (!text || text === lastTextRef.current) return;
        const location = parseWhatsAppLocation(text);
        if (location) {
          lastTextRef.current = text;
          setDetected({ location, text });
        }
      } catch {
        // clipboard-read denied or unavailable — silent
      }
    };

    check(); // check on mount

    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return { detected, dismiss };
}
