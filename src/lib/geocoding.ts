import { Location } from './types';

export async function geocodeAddress(address: string, locale?: string): Promise<Location | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
  try {
    const headers: Record<string, string> = { 'User-Agent': 'ASDRO/1.0' };
    if (locale) headers['Accept-Language'] = locale;
    const res = await fetch(url, { headers });
    const data = await res.json();
    if (!data || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

export function parseGoogleMapsLink(url: string): Location | null {
  const atPattern = /@(-?\d+\.?\d*),(-?\d+\.?\d*)/;
  const atMatch = url.match(atPattern);
  if (atMatch) {
    return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  }

  const qPattern = /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/;
  const qMatch = url.match(qPattern);
  if (qMatch) {
    return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
  }

  const llPattern = /[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/;
  const llMatch = url.match(llPattern);
  if (llMatch) {
    return { lat: parseFloat(llMatch[1]), lng: parseFloat(llMatch[2]) };
  }

  const placePattern = /\/place\/[^/]+\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/;
  const placeMatch = url.match(placePattern);
  if (placeMatch) {
    return { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]) };
  }

  const daddrPattern = /[?&]daddr=(-?\d+\.?\d*),(-?\d+\.?\d*)/;
  const daddrMatch = url.match(daddrPattern);
  if (daddrMatch) {
    return { lat: parseFloat(daddrMatch[1]), lng: parseFloat(daddrMatch[2]) };
  }

  return null;
}
export function parseWhatsAppLocation(message: string): Location | null {
  const urlPattern = /https?:\/\/(maps\.google\.[^\s]+|(www\.)?google\.com\/maps[^\s]*|maps\.app\.goo\.gl[^\s]*|goo\.gl\/maps[^\s]*)/g;
  const match = message.match(urlPattern);
  if (match) {
    for (const url of match) {
      const loc = parseGoogleMapsLink(url);
      if (loc) return loc;
    }
  }

  const anyUrlPattern = /https?:\/\/[^\s]+/g;
  const anyMatch = message.match(anyUrlPattern);
  if (anyMatch) {
    for (const url of anyMatch) {
      const loc = parseGoogleMapsLink(url);
      if (loc) return loc;
    }
  }

  const coordPattern = /(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/;
  const coordMatch = message.match(coordPattern);
  if (coordMatch) {
    return { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]) };
  }

  return null;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ASDRO/1.0' }
    });
    const data = await res.json();
    return data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  } catch {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
}

export function parseMultipleLocations(text: string): { address: string; location?: Location }[] {
  const lines = text.split('\n').filter(l => l.trim());
  const results: { address: string; location?: Location }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const mapsLoc = parseGoogleMapsLink(trimmed);
    const waLoc = parseWhatsAppLocation(trimmed);
    const loc = mapsLoc || waLoc;
    results.push({ address: trimmed, location: loc || undefined });
  }

  return results;
}
