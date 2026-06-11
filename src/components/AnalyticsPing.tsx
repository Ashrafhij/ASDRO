'use client';

import { useEffect } from 'react';

const DEVICE_KEY = 'asdro-device-id';

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export default function AnalyticsPing() {
  useEffect(() => {
    const deviceId = getDeviceId();
    fetch('/api/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  return null;
}
