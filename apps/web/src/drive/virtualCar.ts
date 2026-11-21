import type {DriverAlert, Hazard} from '@margai/contracts';
import {serviceSocketUrl} from '../services/apiClient';
import {CORRIDOR_ID, scopeEdges, type LL} from './geo';

export interface CarPose {pos: LL; headingDeg: number; speedMps: number}
export interface RelayState {connected: boolean; hazards: Hazard[]; alerts: DriverAlert[]}
type Listener = (s: RelayState) => void;
const stamp = (eventName: string, payload: unknown, inputMode = 'simulated') =>
  JSON.stringify({schemaVersion: '1.0', messageId: `m_${Math.random().toString(36).slice(2)}`, eventName, sentAt: new Date().toISOString(), inputMode, payload});

/** One vehicle's own connection to the MargAI relay. Warnings come only from the backend. */
export class VirtualCar {
  state: RelayState = {connected: false, hazards: [], alerts: []};
  onChange: Listener = () => {};
  onUpsert: (hazardId: string, receivedAt: number) => void = () => {};
  onAck: (info: {hazardId: string; isNew: boolean; revision: number; verificationState: string; ms: number}) => void = () => {};
  private ws: WebSocket | null = null;
  private lastPush = 0;
  private sentAt = new Map<string, number>();
  private closed = false;
  private retry?: ReturnType<typeof setTimeout>;
  constructor(readonly id: string, private service = false) { this.connect(); }
  private connect() {
    if (this.closed) return;
    try { this.ws = new WebSocket(serviceSocketUrl('/v1/relay')); } catch { return; }
    const ws = this.ws;
    ws.onopen = () => { this.state = {...this.state, connected: true}; this.onChange(this.state); };
    ws.onclose = () => { this.state = {...this.state, connected: false}; this.onChange(this.state); if (!this.closed) this.retry = setTimeout(() => this.connect(), 1500); };
    ws.onmessage = ev => {
      let e: any; try { e = JSON.parse(ev.data); } catch { return; }
      const p = e.payload ?? {};
      if (e.eventName === 'subscription.snapshot') {
        this.state = {...this.state, hazards: p.hazards ?? [], alerts: p.alerts ?? []}; this.onChange(this.state);
      } else if (e.eventName === 'hazard.upsert') {
        const hz: Hazard = p.hazard;
        const hazards = [...this.state.hazards.filter(h => h.id !== hz.id), hz];
        const alerts = p.personalizedAlert ? [...this.state.alerts.filter(a => a.hazardId !== hz.id), p.personalizedAlert] : this.state.alerts;
        this.state = {...this.state, hazards, alerts}; this.onChange(this.state); this.onUpsert(hz.id, Date.now());
      } else if (e.eventName === 'ack' && p.observationId) {
        const t0 = this.sentAt.get(p.observationId);
        this.onAck({hazardId: p.hazardId, isNew: p.isNew, revision: p.revision, verificationState: p.verificationState, ms: t0 ? Date.now() - t0 : 0});
      }
    };
  }
  /** Re-subscribe with the current pose (also refreshes personalised alerts). Throttled. */
  update(pose: CarPose, force = false) {
    const now = performance.now();
    if (!force && now - this.lastPush < 200) return;
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.lastPush = now;
    const southbound = pose.headingDeg >= 90 && pose.headingDeg <= 270;
    const e = scopeEdges(pose.pos[0], southbound, this.service);
    this.ws.send(stamp('subscription.replace', {
      clientId: this.id, corridorId: CORRIDOR_ID, currentEdgeId: e.current, upcomingEdgeIds: e.upcoming,
      vehiclePose: {latitude: pose.pos[0], longitude: pose.pos[1], headingDeg: pose.headingDeg, speedMps: pose.speedMps, horizontalAccuracyM: 2},
    }));
  }
  submitPothole(pose: CarPose, hazardAt: LL) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    const id = `obs_${this.id}_${Date.now()}`;
    this.sentAt.set(id, Date.now());
    this.ws.send(stamp('observation.submit', {
      id, sourceId: this.id, captureTime: new Date().toISOString(),
      vehiclePose: {latitude: pose.pos[0], longitude: pose.pos[1], headingDeg: pose.headingDeg, speedMps: pose.speedMps, horizontalAccuracyM: 2},
      estimatedHazardLocation: {latitude: hazardAt[0], longitude: hazardAt[1], horizontalAccuracyM: 1.5, provenance: 'simulated'},
      perceptionOutput: [{class: 'pothole', confidence: 0.94, bbox: {x: .4, y: .62, width: .22, height: .16}, frameTimeMs: 16, modelVersion: 'simulated-replay'}],
      inputMode: 'simulated',
    }));
    return true;
  }
  close() { this.closed = true; clearTimeout(this.retry); this.ws?.close(); }
}
