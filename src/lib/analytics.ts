export interface DeviceInfo {
  deviceId: string;
  page: string;
  userAgent: string;
  browser: string;
  os: string;
  osVersion: string;
  deviceModel: string;
  screenWidth: number;
  screenHeight: number;
  screenDensity: number;
  isPwa: boolean;
  language: string;
  timezone: string;
  cpuCores: number;
  connectionType: string;
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
  if (ua.includes('iPhone') || ua.includes('iOS')) return 'iOS';
  if (ua.includes('iPad')) return 'iPadOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Linux')) return 'Linux';
  return 'Other';
}

export function detectOSVersion(ua: string, os: string): string {
  if (os === 'iOS' || os === 'iPadOS') {
    const m = ua.match(/OS (\d+[._]\d+)/);
    if (m) return m[1].replace('_', '.');
  }
  if (os === 'Android') {
    const m = ua.match(/Android (\d+(?:\.\d+)+)/);
    if (m) return m[1];
  }
  if (os === 'Windows') {
    const m = ua.match(/Windows NT (\d+(?:\.\d+)+)/);
    if (m) {
      const v: Record<string, string> = { '10.0': '10+', '6.3': '8.1', '6.2': '8', '6.1': '7' };
      return v[m[1]] || m[1];
    }
  }
  if (os === 'macOS') {
    const m = ua.match(/Mac OS X (\d+[._]\d+)/);
    if (m) return m[1].replace('_', '.');
  }
  return '';
}

export function detectDeviceModel(ua: string, os: string): string {
  if (os === 'iOS' || os === 'iPadOS') {
    // Safari includes the device model
    const m = ua.match(/\(([^)]+iPhone[^)]*)\)/);
    if (m) return m[1].split(';')[0].trim();
    const m2 = ua.match(/\(([^)]+iPad[^)]*)\)/);
    if (m2) return m2[1].split(';')[0].trim();
    // Fallback: Mac + "like Mac OS" is the generic simulator string
    if (os === 'iOS' && ua.includes('like Mac OS X')) return 'iPhone (simulator)';
  }
  if (os === 'Android') {
    // Some Android browsers include the model in userAgent
    const m = ua.match(/; ([\w\s]+) Build\//);
    if (m) return m[1].trim();
    const m2 = ua.match(/; ([\w\s]+)\)/);
    if (m2 && !m2[1].includes('Linux') && !m2[1].includes('Android') && !m2[1].includes('wv')) return m2[1].trim();
  }
  return '';
}

export function detectConnection(): string {
  try {
    const conn = (navigator as any).connection;
    if (conn?.effectiveType) return conn.effectiveType;
  } catch {}
  return '';
}

export function collectDeviceInfo(page: string): DeviceInfo {
  const ua = navigator.userAgent;
  const os = detectOS(ua);
  return {
    deviceId: getDeviceId(),
    page,
    userAgent: ua,
    browser: detectBrowser(ua),
    os,
    osVersion: detectOSVersion(ua, os),
    deviceModel: detectDeviceModel(ua, os),
    screenWidth: screen.width,
    screenHeight: screen.height,
    screenDensity: window.devicePixelRatio || 1,
    isPwa: window.matchMedia('(display-mode: standalone)').matches,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    cpuCores: navigator.hardwareConcurrency || 0,
    connectionType: detectConnection(),
  };
}

const SESSION_START_KEY = 'asdro-session-start';

export function startSession() {
  sessionStorage.setItem(SESSION_START_KEY, Date.now().toString());
}

export function endSession() {
  const start = sessionStorage.getItem(SESSION_START_KEY);
  if (!start) return;
  const duration = Math.round((Date.now() - parseInt(start, 10)) / 1000);
  sessionStorage.removeItem(SESSION_START_KEY);
  if (duration < 5) return; // ignore sub-5s sessions (page refresh etc)
  const deviceId = getDeviceId();
  fetch('/api/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, eventName: 'session_end', metadata: { duration_seconds: duration } }),
    keepalive: true,
  }).catch(() => {});
}

export async function trackEvent(eventName: string, metadata?: Record<string, unknown>) {
  const deviceId = getDeviceId();
  try {
    await fetch('/api/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, eventName, metadata }),
      keepalive: true,
    });
  } catch {
    // silently fail
  }
}

export function trackEventFireAndForget(eventName: string) {
  trackEvent(eventName);
}
