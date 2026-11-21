/** Outer Ring Road corridor geometry from fixtures/corridors/outer_ring_road_blr.json (surveyed waypoints, simulated vehicles). */
export type LL = [number, number];
export const CORRIDOR_ID = 'blr_outer_ring_road';
export const EDGES = {
  marathahalli: 'orr_south_marathahalli_main',
  kadubeesanahalli: 'orr_south_kadubeesanahalli_main',
  bellandur: 'orr_south_bellandur_main',
  service: 'orr_south_bellandur_service',
  north: 'orr_north_bellandur_main',
} as const;
export const WAYPOINTS: {name: string; ll: LL}[] = [
  {name: 'Kadubeesanahalli Underpass', ll: [12.9372, 77.6953]},
  {name: 'Cessna Business Park', ll: [12.9328, 77.6914]},
  {name: 'Bellandur EcoSpace', ll: [12.9275, 77.6842]},
  {name: 'Devarabeesanahalli Flyover', ll: [12.9221, 77.6765]},
];
const rad = (d: number) => (d * Math.PI) / 180;
export function dist(a: LL, b: LL) {
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}
export function bearing(a: LL, b: LL) {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
export const ROUTE: LL[] = WAYPOINTS.map(w => w.ll);
export const CUM: number[] = [0];
ROUTE.forEach((p, i) => { if (i) CUM.push(CUM[i - 1] + dist(ROUTE[i - 1], p)); });
export const TOTAL = CUM[CUM.length - 1];
export function pointAt(s: number): {pos: LL; heading: number} {
  s = Math.max(0, Math.min(TOTAL, s));
  let i = 1;
  while (i < CUM.length - 1 && CUM[i] < s) i++;
  const f = (s - CUM[i - 1]) / ((CUM[i] - CUM[i - 1]) || 1);
  const a = ROUTE[i - 1], b = ROUTE[i];
  return {pos: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], heading: bearing(a, b)};
}
/** Shift a point sideways (metres, +right of heading). */
export function offset(pos: LL, headingDeg: number, metres: number): LL {
  const h = rad(headingDeg + 90);
  return [pos[0] + (Math.cos(h) * metres) / 111320, pos[1] + (Math.sin(h) * metres) / (111320 * Math.cos(rad(pos[0])))];
}
/** Same prototype matching rule as the backend: latitude picks the segment. */
export function segmentIndexForLat(lat: number) { return lat > 12.9482 ? 0 : lat > 12.93 ? 1 : 2; }
const SOUTH = [EDGES.marathahalli, EDGES.kadubeesanahalli, EDGES.bellandur];
export function scopeEdges(lat: number, southbound: boolean, service = false) {
  if (!southbound) return {current: EDGES.north, upcoming: [] as string[]};
  if (service) return {current: EDGES.service, upcoming: [] as string[]};
  const i = segmentIndexForLat(lat);
  return {current: SOUTH[i], upcoming: SOUTH.filter((_, j) => Math.abs(j - i) === 1)};
}
/** Nearest point on the corridor for a real GPS fix; null when too far away. */
export function snapToCorridor(p: LL): {s: number; distM: number} | null {
  let best: {s: number; distM: number} | null = null;
  for (let s = 0; s <= TOTAL; s += 10) {
    const d = dist(p, pointAt(s).pos);
    if (!best || d < best.distM) best = {s, distM: d};
  }
  return best && best.distM <= 300 ? best : null;
}
