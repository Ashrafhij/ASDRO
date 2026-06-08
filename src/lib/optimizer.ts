import { Location, Customer, Waypoint, OptimizedRoute } from './types';

const OSRM_BASE = 'https://router.project-osrm.org';

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineDistance(a: Location, b: Location): number {
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

function formatInstruction(step: { maneuver: { type: string; modifier?: string }; name: string }, locale?: string): string {
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
    ? { turn: 'פנה', onto: 'ל', cont: 'המשך', on: 'ב', round: 'היכנס לכיכר', at: 'ב', merge: 'השתלב', keep: 'הישאר', ontoAlt: 'ל' }
    : locale === 'ar'
    ? { turn: 'انعطف', onto: 'إلى', cont: 'تابع', on: 'في', round: 'ادخل الدوار', at: 'في', merge: 'اندمج', keep: 'ابق', ontoAlt: 'إلى' }
    : { turn: 'Turn', onto: ' onto', cont: 'Continue', on: ' on', round: 'Enter roundabout', at: ' at', merge: 'Merge', keep: 'Keep', ontoAlt: ' onto' };

  if (type === 'turn' || type === 'end of road') return `${t.turn} ${dir}${t.onto}${name ? ` ${name}` : ''}`;
  if (type === 'continue') return `${t.cont}${name ? `${t.on} ${name}` : ''}`;
  if (type === 'roundabout' || type === 'rotary') return `${t.round}${name ? `${t.at} ${name}` : ''}`;
  if (type === 'merge') return `${t.merge}${dir ? ` ${dir}` : ''}${name ? ` ${t.ontoAlt} ${name}` : ''}`;
  if (type === 'fork') return `${t.keep} ${dir}${name ? ` ${t.ontoAlt} ${name}` : ''}`;
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  return `${typeLabel} ${dir}${name ? ` ${t.ontoAlt} ${name}` : ''}`;
}

async function getOSRMRoute(start: Location, end: Location, locale?: string): Promise<{ distance: number; duration: number; geometry?: [number, number][]; instruction?: string } | null> {
  const url = `${OSRM_BASE}/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&steps=true${locale && ['he', 'ar'].includes(locale) ? `&language=${locale}` : ''}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) return null;
    const route = data.routes[0];
    let geometry: [number, number][] | undefined;
    let instruction: string | undefined;
    if (route.geometry) geometry = decodePolyline(route.geometry);
    if (route.legs?.[0]?.steps?.length) {
      const first = route.legs[0].steps.find((s: { maneuver: { type: string } }) => s.maneuver.type !== 'depart');
      if (first) instruction = formatInstruction(first, locale);
    }
    return {
      distance: route.distance / 1000,
      duration: route.duration / 60,
      geometry,
      instruction,
    };
  } catch {
    return null;
  }
}

async function buildDistanceMatrix(points: Location[], locale?: string): Promise<{
  distances: number[][];
  durations: number[][];
  geometries: ([number, number][] | undefined)[][];
  instructions: (string | undefined)[][];
}> {
  const n = points.length;
  const distances: number[][] = [];
  const durations: number[][] = [];
  const geometries: ([number, number][] | undefined)[][] = [];
  const instructions: (string | undefined)[][] = [];

  for (let i = 0; i < n; i++) {
    distances.push([]);
    durations.push([]);
    geometries.push([]);
    instructions.push([]);
    for (let j = 0; j < n; j++) {
      if (i === j) {
        distances[i].push(0);
        durations[i].push(0);
        geometries[i].push(undefined);
        instructions[i].push(undefined);
      } else {
        const osrm = await getOSRMRoute(points[i], points[j], locale);
        if (osrm) {
          distances[i].push(osrm.distance);
          durations[i].push(osrm.duration);
          geometries[i].push(osrm.geometry);
          instructions[i].push(osrm.instruction);
        } else {
          const d = haversineDistance(points[i], points[j]);
          distances[i].push(d);
          durations[i].push((d / 40) * 60);
          geometries[i].push(undefined);
          instructions[i].push(undefined);
        }
      }
    }
  }

  return { distances, durations, geometries, instructions };
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

function twoOptImprovement(route: number[], distances: number[][]): number[] {
  let improved = true;
  let best = route;

  while (improved) {
    improved = false;
    for (let i = 1; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
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
  locale?: string
): Promise<OptimizedRoute> {
  if (customers.length === 0) {
    return { waypoints: [], totalDistance: 0, totalDuration: 0 };
  }

  const points = [startLocation, ...customers.map(c => c.location)];
  const { distances, durations, geometries, instructions } = await buildDistanceMatrix(points, locale);

  const available = new Set(Array.from({ length: customers.length }, (_, i) => i + 1));
  const rawRoute = nearestNeighborTSP(distances, 0, available);
  const improvedRoute = twoOptImprovement(rawRoute, distances);
  const finalCustomers = improvedRoute.filter(i => i !== 0).map(i => i - 1);

  const waypoints: Waypoint[] = [];
  let totalDist = 0;
  let totalDur = 0;
  let cumulativeTime = 0;

  for (let i = 0; i < finalCustomers.length; i++) {
    const cust = customers[finalCustomers[i]];
    const prevIdx = i === 0 ? 0 : finalCustomers[i - 1] + 1;
    const currIdx = finalCustomers[i] + 1;
    const dist = distances[prevIdx][currIdx];
    const dur = durations[prevIdx][currIdx];
    totalDist += dist;
    totalDur += dur;
    cumulativeTime += dur;

    const now = new Date();
    const arrival = new Date(now.getTime() + cumulativeTime * 60 * 1000);

    waypoints.push({
      customer: cust,
      order: i + 1,
      estimatedArrival: arrival.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      distanceFromPrevious: parseFloat(dist.toFixed(1)),
      timeFromPrevious: parseFloat(dur.toFixed(1)),
      legGeometry: geometries[prevIdx][currIdx],
      nextInstruction: instructions[prevIdx][currIdx],
    });
  }

  return {
    waypoints,
    totalDistance: parseFloat(totalDist.toFixed(1)),
    totalDuration: parseFloat(totalDur.toFixed(1))
  };
}
