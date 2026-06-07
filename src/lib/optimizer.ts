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

async function getOSRMRoute(start: Location, end: Location): Promise<{ distance: number; duration: number } | null> {
  const url = `${OSRM_BASE}/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=false`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.length) return null;
    const route = data.routes[0];
    return {
      distance: route.distance / 1000,
      duration: route.duration / 60
    };
  } catch {
    return null;
  }
}

async function buildDistanceMatrix(points: Location[]): Promise<{
  distances: number[][];
  durations: number[][];
}> {
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
        const osrm = await getOSRMRoute(points[i], points[j]);
        if (osrm) {
          distances[i].push(osrm.distance);
          durations[i].push(osrm.duration);
        } else {
          const d = haversineDistance(points[i], points[j]);
          distances[i].push(d);
          durations[i].push((d / 40) * 60);
        }
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
  startLocation: Location
): Promise<OptimizedRoute> {
  if (customers.length === 0) {
    return { waypoints: [], totalDistance: 0, totalDuration: 0 };
  }

  const points = [startLocation, ...customers.map(c => c.location)];
  const { distances, durations } = await buildDistanceMatrix(points);

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
      timeFromPrevious: parseFloat(dur.toFixed(1))
    });
  }

  return {
    waypoints,
    totalDistance: parseFloat(totalDist.toFixed(1)),
    totalDuration: parseFloat(totalDur.toFixed(1))
  };
}
