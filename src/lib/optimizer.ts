import { Location, Customer, Waypoint, OptimizedRoute, TurnStep } from './types';

const OSRM_SERVERS = [
  'https://router.project-osrm.org',
  'https://routing.openstreetmap.de/routed-car',
];

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistance(a: Location, b: Location): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let result = 0, shift = 0, b;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;
    result = 0; shift = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;
    points.push([lat * 1e-5, lng * 1e-5]);
  }
  return points;
}

export function formatInstruction(step: { maneuver: { type: string; modifier?: string }; name: string }, locale?: string): string {
  const type = step.maneuver.type;
  const mod = step.maneuver.modifier || '';
  const name = step.name || '';
  if (type === 'depart' || type === 'arrive') return '';

  const en: Record<string, string> = { left: 'left', right: 'right', straight: 'straight', slight_left: 'slightly left', slight_right: 'slightly right', sharp_left: 'sharp left', sharp_right: 'sharp right', uturn: 'U-turn' };
  const he: Record<string, string> = { left: 'שמאלה', right: 'ימינה', straight: 'ישר', slight_left: 'קלות שמאלה', slight_right: 'קלות ימינה', sharp_left: 'חד שמאלה', sharp_right: 'חד ימינה', uturn: 'פניית פרסה' };
  const ar: Record<string, string> = { left: 'يسارًا', right: 'يمينًا', straight: 'مباشرة', slight_left: 'يسارًا قليلاً', slight_right: 'يمينًا قليلاً', sharp_left: 'يسارًا بحدة', sharp_right: 'يمينًا بحدة', uturn: 'دوران كامل' };
  const dirs = locale === 'he' ? he : locale === 'ar' ? ar : en;
  const dir = dirs[mod] || mod;

  const t = locale === 'he'
    ? { turn: 'פנה', onto: ' ל', cont: 'המשך', on: 'ב', round: 'היכנס לכיכר', at: 'ב', merge: 'השתלב', keep: 'הישאר', ontoAlt: 'ל', newName: 'המשך', ramp: 'צא', notify: 'שים לב', exit: 'צא מהכיכר', waypoint: 'נקודת ציון' }
    : locale === 'ar'
    ? { turn: 'انعطف', onto: ' إلى', cont: 'تابع', on: 'في', round: 'ادخل الدوار', at: 'في', merge: 'اندمج', keep: 'ابق', ontoAlt: 'إلى', newName: 'تابع', ramp: 'اسلك المنحدر', notify: 'تنبيه', exit: 'اخرج من الدوار', waypoint: 'نقطة الطريق' }
    : { turn: 'Turn', onto: ' onto', cont: 'Continue', on: ' on', round: 'Enter roundabout', at: ' at', merge: 'Merge', keep: 'Keep', ontoAlt: ' onto', newName: 'Continue', ramp: 'Take the ramp', notify: 'Note', exit: 'Exit roundabout', waypoint: 'Waypoint' };

  if (type === 'turn' || type === 'end of road') return `${t.turn} ${dir}${t.onto}${name ? ` ${name}` : ''}`;
  if (type === 'continue') return `${t.cont}${name ? `${t.on} ${name}` : ''}`;
  if (type === 'roundabout' || type === 'rotary') return `${t.round}${name ? `${t.at} ${name}` : ''}`;
  if (type === 'roundabout turn') return `${t.round} ${dir}${name ? ` ${t.at} ${name}` : ''}`;
  if (type === 'exit roundabout' || type === 'exit rotary') return `${t.exit}${name ? ` ${t.at} ${name}` : ''}`;
  if (type === 'merge' || type === 'on ramp') return `${t.merge}${dir ? ` ${dir}` : ''}${name ? ` ${t.ontoAlt} ${name}` : ''}`;
  if (type === 'off ramp') return `${t.ramp}${dir ? ` ${dir}` : ''}${name ? ` ${t.ontoAlt} ${name}` : ''}`;
  if (type === 'fork') return `${t.keep} ${dir}${name ? ` ${t.ontoAlt} ${name}` : ''}`;
  if (type === 'new name') return `${t.newName}${name ? `${t.on} ${name}` : ''}`;
  if (type === 'notification') return `${t.notify}${name ? `: ${name}` : ''}`;
  if (type === 'waypoint') return `${t.waypoint}${name ? `: ${name}` : ''}`;
  if (type === 'use lane') return dir ? `${t.cont} ${dir}` : '';
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  return `${typeLabel}${dir ? ` ${dir}` : ''}${name ? `${t.onto ? ' ' + t.onto.trim() : ''} ${name}` : ''}`;
}

function sqr(x: number) { return x * x; }
function dist2(v: [number, number], w: [number, number]) { return sqr(v[0] - w[0]) + sqr(v[1] - w[1]); }

/** Minimum distance (in km) from point p to line segment [v, w] */
function distToSegmentSq(p: [number, number], v: [number, number], w: [number, number]): number {
  const l2 = dist2(v, w);
  if (l2 === 0) return dist2(p, v);
  let t = ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist2(p, [v[0] + t * (w[0] - v[0]), v[1] + t * (w[1] - v[1])]);
}

/** Minimum distance (in km) from point to a polyline */
export function distanceToPolyline(point: Location, polyline: [number, number][]): number {
  const p: [number, number] = [point.lat, point.lng];
  let minSq = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = distToSegmentSq(p, polyline[i], polyline[i + 1]);
    if (d < minSq) minSq = d;
  }
  return Math.sqrt(minSq);
}

function straightLineGeometry(a: Location, b: Location, steps = 20): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t]);
  }
  return pts;
}

export async function getOSRMRoute(start: Location, end: Location, locale?: string): Promise<{ distance: number; duration: number; geometry: [number, number][]; instruction?: string; steps: TurnStep[] }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { distance: haversineDistance(start, end), duration: (haversineDistance(start, end) / 40) * 60, geometry: straightLineGeometry(start, end), steps: [] };

  for (const base of OSRM_SERVERS) {
    const url = `${base}/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&steps=true`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json();
        if (data.code !== 'Ok' || !data.routes?.length) {
          console.error('OSRM error:', data.code, data.message || '', base);
          if (attempt < 2) { await new Promise(r => setTimeout(r, 1000)); continue; }
          break;
        }
        const route = data.routes[0];
        const geometry = route.geometry ? decodePolyline(route.geometry) : undefined;
        let instruction: string | undefined;
        let steps: TurnStep[] = [];
        if (route.legs?.[0]?.steps?.length) {
          const legSteps = route.legs[0].steps;
          const first = legSteps.find((s: { maneuver: { type: string } }) => s.maneuver.type !== 'depart');
          if (first) instruction = formatInstruction(first, locale);
          steps = legSteps
            .filter((s: { maneuver: { type: string } }) => s.maneuver.type !== 'depart' && s.maneuver.type !== 'arrive')
            .map((s: any) => ({
              type: s.maneuver.type,
              modifier: s.maneuver.modifier,
              location: { lat: s.maneuver.location[1], lng: s.maneuver.location[0] },
              name: s.name || '',
              distance: s.distance,
              instruction: formatInstruction(s, locale),
            }));
        }
        clearTimeout(timeoutId);
        return {
          distance: route.distance / 1000,
          duration: route.duration / 60,
          geometry: geometry || straightLineGeometry(start, end),
          instruction,
          steps,
        };
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          console.error('OSRM timeout:', base);
          break;
        }
        if (attempt < 2) { await new Promise(r => setTimeout(r, 1000)); continue; }
        console.error('OSRM failed:', base, start, end, e);
      }
    }
    clearTimeout(timeoutId);
  }

  // All servers failed — return straight-line fallback
  return {
    distance: haversineDistance(start, end),
    duration: (haversineDistance(start, end) / 40) * 60,
    geometry: straightLineGeometry(start, end),
    steps: [],
  };
}

function buildHaversineMatrix(points: Location[]): { distances: number[][]; durations: number[][] } {
  const n = points.length;
  const distances: number[][] = [];
  const durations: number[][] = [];
  for (let i = 0; i < n; i++) {
    distances.push([]);
    durations.push([]);
    for (let j = 0; j < n; j++) {
      if (i === j) {
        distances[i].push(0);
        durations[i].push(0);
      } else {
        const d = haversineDistance(points[i], points[j]);
        distances[i].push(d);
        durations[i].push((d / 40) * 60);
      }
    }
  }
  return { distances, durations };
}

function nearestNeighborTSP(
  distances: number[][],
  startIdx: number,
  available: Set<number>
): number[] {
  const route = [startIdx];
  let current = startIdx;
  available.delete(startIdx);

  while (available.size > 0) {
    let bestNext = -1;
    let bestDist = Infinity;
    for (const next of available) {
      if (distances[current][next] < bestDist) {
        bestDist = distances[current][next];
        bestNext = next;
      }
    }
    if (bestNext === -1) break;
    route.push(bestNext);
    available.delete(bestNext);
    current = bestNext;
  }

  return route;
}

function twoOptImprovement(route: number[], distances: number[][], endIdx?: number): number[] {
  let improved = true;
  let best = route;
  const limit = endIdx !== undefined ? best.length - 2 : best.length - 1;

  while (improved) {
    improved = false;
    for (let i = 1; i < limit; i++) {
      for (let j = i + 1; j <= limit; j++) {
        const newRoute = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1)
        ];
        const currentDist = totalDistance(best, distances);
        const newDist = totalDistance(newRoute, distances);
        if (newDist < currentDist) {
          best = newRoute;
          improved = true;
        }
      }
    }
  }

  return best;
}

function totalDistance(route: number[], distances: number[][]): number {
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += distances[route[i]][route[i + 1]];
  }
  return total;
}

export async function optimizeRoute(
  customers: Customer[],
  startLocation: Location,
  locale?: string,
  endLocation?: Location
): Promise<OptimizedRoute> {
  if (customers.length === 0) {
    return { waypoints: [], totalDistance: 0, totalDuration: 0 };
  }

  // Step 1: Use haversine (no API calls) for TSP ordering
  const hasEnd = !!endLocation;
  const points = [startLocation, ...customers.map(c => c.location), ...(hasEnd ? [endLocation!] : [])];
  const { distances } = buildHaversineMatrix(points);
  const endIdx = hasEnd ? customers.length + 1 : undefined;

  const available = new Set(Array.from({ length: customers.length }, (_, i) => i + 1));
  const rawRoute = nearestNeighborTSP(distances, 0, available);
  if (hasEnd) rawRoute.push(endIdx!);
  const improvedRoute = twoOptImprovement(rawRoute, distances, endIdx);
  const finalCustomers = improvedRoute.filter(i => i !== 0 && i !== endIdx).map(i => i - 1);

  // Step 2: Get road geometry per leg via OSRM (N calls, not N²)
  const waypoints: Waypoint[] = [];
  let totalDist = 0;
  let totalDur = 0;
  let cumulativeTime = 0;

  for (let i = 0; i < finalCustomers.length; i++) {
    const cust = customers[finalCustomers[i]];
    const from = i === 0 ? startLocation : customers[finalCustomers[i - 1]].location;
    const to = cust.location;

    const osrm = await getOSRMRoute(from, to, locale);
    const dist = osrm.distance;
    const dur = osrm.duration;
    const legGeometry = osrm.geometry;
    const nextInstruction = osrm.instruction;
    const steps = osrm.steps;

    totalDist += dist;
    totalDur += dur;
    cumulativeTime += dur;

    const now = new Date();
    const arrival = new Date(now.getTime() + cumulativeTime * 60 * 1000);

    waypoints.push({
      customer: cust,
      order: i + 1,
      estimatedArrival: arrival.toLocaleTimeString(locale || 'en-US', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      distanceFromPrevious: parseFloat(dist.toFixed(1)),
      timeFromPrevious: parseFloat(dur.toFixed(1)),
      legGeometry,
      nextInstruction,
      steps,
    });
  }

  // Step 3: Add final leg to end location if provided
  if (hasEnd && finalCustomers.length > 0) {
    const lastCust = customers[finalCustomers[finalCustomers.length - 1]];
    const osrm = await getOSRMRoute(lastCust.location, endLocation!, locale);
    const dist = osrm.distance;
    const dur = osrm.duration;
    totalDist += dist;
    totalDur += dur;

    waypoints.push({
      customer: { id: 'end', name: '', phone: '', notes: '', location: endLocation!, address: '' },
      order: finalCustomers.length + 1,
      estimatedArrival: '',
      distanceFromPrevious: parseFloat(dist.toFixed(1)),
      timeFromPrevious: parseFloat(dur.toFixed(1)),
      legGeometry: osrm.geometry,
      nextInstruction: osrm.instruction,
      steps: osrm.steps,
    });
  }

  return {
    waypoints,
    totalDistance: parseFloat(totalDist.toFixed(1)),
    totalDuration: parseFloat(totalDur.toFixed(1))
  };
}
