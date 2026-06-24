export interface Location {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  location: Location;
  address: string;
  notes: string;
}

export interface TurnStep {
  type: string;
  modifier?: string;
  location: Location;
  name: string;
  distance: number;
  instruction: string;
}

export interface Waypoint {
  customer: Customer;
  order: number;
  estimatedArrival: string;
  distanceFromPrevious: number;
  timeFromPrevious: number;
  legGeometry?: [number, number][];
  nextInstruction?: string;
  steps?: TurnStep[];
}

export interface OptimizedRoute {
  waypoints: Waypoint[];
  totalDistance: number;
  totalDuration: number;
  polyline?: string;
}

export interface DriverLocation {
  lat: number;
  lng: number;
  address: string;
}
