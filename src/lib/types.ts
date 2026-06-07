export interface Location {
  lat: number;
  lng: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  location: Location;
  address: string;
  notes: string;
}

export interface Waypoint {
  customer: Customer;
  order: number;
  estimatedArrival: string;
  distanceFromPrevious: number;
  timeFromPrevious: number;
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
