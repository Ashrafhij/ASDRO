'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Location } from './types';
import { parseWhatsAppLocation } from './geocoding';

export function useClipboardDetection() {
  const [detected, setDetected] = useState<{ location: Location; text: string } | null>(null);
  const [hasContent, setHasContent] = useState<boolean | null>(null); // null = unknown
  const lastTextRef = useRef('');

  const dismiss = useCallback(() => {
    setDetected(null);
  }, []);

  useEffect(() => {
    const check = async () => {
      try {
        if (!navigator.clipboard || !navigator.clipboard.readText) {
          setHasContent(null); // can't check — show fallback
          return;
        }
        const text = await navigator.clipboard.readText();
        if (!text || text.trim().length === 0) {
          setHasContent(false);
          return;
        }
        setHasContent(true);
        if (text === lastTextRef.current) return;
        const location = parseWhatsAppLocation(text);
        if (location) {
          lastTextRef.current = text;
          setDetected({ location, text });
        }
      } catch {
        // Permission denied or HTTP — can't check, show fallback
        setHasContent(null);
      }
    };

    check();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return { detected, dismiss, showButton: hasContent !== false };
}
