export interface DeviceInfo {
  deviceId: string;
  page: string;
  userAgent: string;
  browser: string;
  os: string;
  screenWidth: number;
  screenHeight: number;
  isPwa: boolean;
  language: string;
  timezone: string;
}

const DEVICE_KEY = 'asdro-device-id';

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function detectBrowser(ua: string): string {
  if (ua.includes('Edg/') || ua.includes('Edge/')) return 'Edge';
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
  if (ua.includes('OPR/') || ua.includes('Opera/')) return 'Opera';
  return 'Other';
}

export function detectOS(ua: string): string {
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS') && !ua.includes('iPhone') && !ua.includes('iPad')) return 'macOS';
  if (ua.includes('iPhone') || (ua.includes('iOS'))) return 'iOS';
  if (ua.includes('iPad')) return 'iPadOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Linux')) return 'Linux';
  return 'Other';
}

export function collectDeviceInfo(page: string): DeviceInfo {
  const ua = navigator.userAgent;
  return {
    deviceId: getDeviceId(),
    page,
    userAgent: ua,
    browser: detectBrowser(ua),
    os: detectOS(ua),
    screenWidth: screen.width,
    screenHeight: screen.height,
    isPwa: window.matchMedia('(display-mode: standalone)').matches,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export async function trackEvent(eventName: string) {
  const deviceId = getDeviceId();
  try {
    await fetch('/api/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, eventName }),
      keepalive: true,
    });
  } catch {
    // silently fail
  }
}

export function trackEventFireAndForget(eventName: string) {
  trackEvent(eventName);
}
