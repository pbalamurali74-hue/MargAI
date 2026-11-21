import type {Pose} from './relay';
export type RiskLevel = 'information' | 'caution' | 'urgent';
export type HazardView = {id: string; type: string; lat: number; lon: number; firstSeen: number; lastSeen: number; source: SourceKind; confidence: number};
export type SourceKind = 'live_phone' | 'simulated' | 'seeded_demo' | 'recorded_replay';
export type VehicleView = {id: string; kind: 'live' | 'simulated'; pose: Pose};

export const ICON: Record<string, string> = {pothole: '🕳️', animal: '🐄', pedestrian: '🚶', low_visibility: '🌫️', suspected_incident: '💥', confirmed_incident: '💥', collision_risk: '⚠️', sharp_curve: '↪️'};
export const COLOR: Record<string, string> = {pothole: '#ffc23d', animal: '#18c98a', pedestrian: '#3dd5f3', low_visibility: '#9fb4d6', suspected_incident: '#ff5d73', confirmed_incident: '#ff5d73', collision_risk: '#ff5d73', sharp_curve: '#7a4dff'};
export const LEVEL_COLOR: Record<RiskLevel, string> = {information: '#2f6bff', caution: '#ffc23d', urgent: '#ff5d73'};
export const TYPE_LABEL: Record<string, string> = {pothole: 'Pothole', animal: 'Cattle / animal', pedestrian: 'Pedestrian', low_visibility: 'Fog / low visibility', suspected_incident: 'Accident', confirmed_incident: 'Accident', collision_risk: 'Collision risk', sharp_curve: 'Sharp curve'};
export const SOURCE_LABEL: Record<SourceKind, string> = {live_phone: 'LIVE phone', simulated: 'Simulated', seeded_demo: 'Demo data', recorded_replay: 'Replay'};
export const MESSAGE_KEY: Record<string, string> = {pothole: 'hazard.pothole.ahead', pedestrian: 'hazard.pedestrian.path_conflict', animal: 'hazard.animal.path_conflict', suspected_incident: 'hazard.incident.ahead_unverified', confirmed_incident: 'hazard.incident.ahead_confirmed', collision_risk: 'hazard.incident.ahead_unverified', low_visibility: 'visibility.low', sharp_curve: 'road.curve.ahead'};

export function toHazardView(h: any, inputMode?: string): HazardView | null {
  if (!h?.id || !h.location) return null;
  const sk = h.metadata?.sourceKind as SourceKind | undefined;
  const source: SourceKind = sk && SOURCE_LABEL[sk] ? sk : inputMode === 'recorded_replay' ? 'recorded_replay' : inputMode === 'simulated' ? 'simulated' : 'live_phone';
  return {id: h.id, type: h.type, lat: h.location.latitude, lon: h.location.longitude, firstSeen: Date.parse(h.firstSeen) || Date.now(), lastSeen: Date.parse(h.lastSeen) || Date.now(), source, confidence: h.confidence ?? 0};
}

/** Phone alert payloads are free-form; map them tolerantly to a hazard type. */
export function guessType(p: any): string {
  const raw = String(p?.hazardType || p?.type || p?.class || p?.text || '').toLowerCase();
  if (/cow|cattle|animal|dog|buffalo/.test(raw)) return 'animal';
  if (/pothole/.test(raw)) return 'pothole';
  if (/fog|visib/.test(raw)) return 'low_visibility';
  if (/accident|incident|crash|collision/.test(raw)) return 'suspected_incident';
  if (/pedestrian|person|people/.test(raw)) return 'pedestrian';
  if (/curve/.test(raw)) return 'sharp_curve';
  return 'collision_risk';
}

export function circlePolygon(lat: number, lon: number, radiusM: number, steps = 48): number[][] {
  const out: number[][] = []; const dLat = radiusM / 111320; const dLon = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
  for (let i = 0; i <= steps; i++) { const a = (i / steps) * 2 * Math.PI; out.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]); }
  return out;
}
export const angDiff = (a: number, b: number) => ((b - a + 540) % 360) - 180;
