import {serviceSocketUrl} from '../services/apiClient';

export type Envelope = {schemaVersion: string; messageId: string; eventName: string; sentAt: string; inputMode: 'live' | 'recorded_replay' | 'simulated'; payload: any};
export type Pose = {latitude: number; longitude: number; headingDeg: number; speedMps: number; horizontalAccuracyM: number};
type Handler = (e: Envelope) => void;

/** Thin, reconnecting client for the MargAI relay (/v1/relay). Used by the driver app, live map and car display. */
export class LiveRelay {
  connected = false;
  onStatus: (connected: boolean) => void = () => {};
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private onOpenQueue: (() => void)[] = [];
  private closed = false;
  private retry?: ReturnType<typeof setTimeout>;
  constructor() { this.connect(); }
  private connect() {
    if (this.closed) return;
    try { this.ws = new WebSocket(serviceSocketUrl('/v1/relay')); } catch { this.retry = setTimeout(() => this.connect(), 2000); return; }
    const ws = this.ws;
    ws.onopen = () => { this.connected = true; this.onStatus(true); this.onOpenQueue.forEach(f => f()); };
    ws.onclose = () => { this.connected = false; this.onStatus(false); if (!this.closed) this.retry = setTimeout(() => this.connect(), 1500); };
    ws.onmessage = ev => { let e: Envelope; try { e = JSON.parse(ev.data); } catch { return; } this.handlers.get(e.eventName)?.forEach(h => h(e)); this.handlers.get('*')?.forEach(h => h(e)); };
  }
  /** Run on every (re)connect — use for subscribe / pair / watch joins so they survive reconnects. */
  whenOpen(fn: () => void) { this.onOpenQueue.push(fn); if (this.connected) fn(); }
  on(eventName: string, h: Handler) { if (!this.handlers.has(eventName)) this.handlers.set(eventName, new Set()); this.handlers.get(eventName)!.add(h); return () => this.handlers.get(eventName)?.delete(h); }
  send(eventName: string, payload: unknown, inputMode: Envelope['inputMode'] = 'live') {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({schemaVersion: '1.0', messageId: `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, eventName, sentAt: new Date().toISOString(), inputMode, payload}));
    return true;
  }
  close() { this.closed = true; clearTimeout(this.retry); this.ws?.close(); }
}

const inOrr = (lat: number, lon: number) => lat > 12.9 && lat < 12.96 && lon > 77.6 && lon < 77.71;
/** Subscription scope for a vehicle anywhere (mirrors backend matchRoadReference). */
export function scopeFor(clientId: string, pose: Pose) {
  if (inOrr(pose.latitude, pose.longitude)) {
    const south = pose.headingDeg >= 90 && pose.headingDeg <= 270;
    const S = ['orr_south_marathahalli_main', 'orr_south_kadubeesanahalli_main', 'orr_south_bellandur_main'];
    const i = pose.latitude > 12.9482 ? 0 : pose.latitude > 12.93 ? 1 : 2;
    return {clientId, corridorId: 'blr_outer_ring_road', currentEdgeId: south ? S[i] : 'orr_north_bellandur_main', upcomingEdgeIds: south ? S.filter((_, j) => Math.abs(j - i) === 1) : [], vehiclePose: pose};
  }
  const b = Math.round((((pose.headingDeg % 360) + 360) % 360) / 45) % 8;
  return {clientId, corridorId: 'open_road', currentEdgeId: `open_h${b}`, upcomingEdgeIds: [`open_h${(b + 1) % 8}`, `open_h${(b + 7) % 8}`], vehiclePose: pose};
}
