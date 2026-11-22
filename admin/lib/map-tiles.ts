/** Web Mercator math for OpenStreetMap raster tiles (256 px), used by the admin map picker. */
export type LatLng = { lat: number; lng: number };
export const TILE = 256;

/** World pixel position at a zoom level. */
export function project(lat: number, lng: number, zoom: number) {
  const size = TILE * 2 ** zoom, sin = Math.min(0.9999, Math.max(-0.9999, Math.sin(lat * Math.PI / 180)));
  return { x: (lng + 180) / 360 * size, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size };
}

/** Inverse of `project`; longitudes wrap into −180…180. */
export function unproject(x: number, y: number, zoom: number): LatLng {
  const size = TILE * 2 ** zoom, n = Math.PI - 2 * Math.PI * y / size;
  const lng = ((x / size * 360) % 360 + 360) % 360 - 180;
  // Web Mercator ends at ±85.0511°; dragging past the edge must not reach the poles (cos → 0).
  const lat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, 180 / Math.PI * Math.atan(Math.sinh(n))));
  return { lat, lng };
}

export const MAX_MERCATOR_LAT = 85.05112878;

/** Ground metres covered by one screen pixel at this latitude and zoom. */
export const metersPerPixel = (lat: number, zoom: number) =>
  156_543.03392 * Math.cos(Math.min(MAX_MERCATOR_LAT, Math.abs(lat)) * Math.PI / 180) / 2 ** zoom;
