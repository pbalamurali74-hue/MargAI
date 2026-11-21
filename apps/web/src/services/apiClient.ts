import { Hazard, Observation, CivicCase, EventEnvelope, SubscriptionScope, DriverAlert } from '@margai/contracts';

type ClientEnvironment = { VITE_API_ORIGIN?: string; VITE_VISION_API_ORIGIN?: string };
const environment = (import.meta as ImportMeta & { env?: ClientEnvironment }).env || {};
/** Empty origins keep the existing same-origin/Google Cloud deployment contract. */
export function serviceUrl(path: string, vision = false): string {
  const origin = (vision ? environment.VITE_VISION_API_ORIGIN : environment.VITE_API_ORIGIN)?.replace(/\/$/, '') || '';
  return `${origin}${path}`;
}
export function serviceSocketUrl(path: string, vision = false): string {
  const url = new URL(serviceUrl(path, vision), window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export class MargAIClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionGeneration = 0;
  private connectionStatus?: (connected: boolean) => void;

  private async request<T = any>(path: string, options?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(serviceUrl(path), { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const type = response.headers.get('content-type') || '';
      if (!type.includes('json')) throw new Error('The API did not return JSON. Check the backend origin.');
      return await response.json();
    } finally { window.clearTimeout(timeout); }
  }
  public getHealth() { return this.request('/health'); }
  public getConfig() { return this.request('/v1/config'); }
  public getBuildathonMeta() { return this.request('/v1/buildathon-meta'); }
  public getHazards(corridorId?: string): Promise<Hazard[]> { return this.request(`/v1/hazards${corridorId ? `?corridorId=${encodeURIComponent(corridorId)}` : ''}`); }
  public getCases(): Promise<CivicCase[]> { return this.request('/v1/cases'); }
  public generateGeminiReport(caseId: string) { return this.request(`/v1/cases/${encodeURIComponent(caseId)}/gemini-report`, { method: 'POST' }); }
  public submitToAuthority(caseId: string) { return this.request(`/v1/cases/${encodeURIComponent(caseId)}/submission-attempts`, { method: 'POST' }); }
  public postObservation(observation: Observation) { return this.request('/v1/observations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(observation) }); }
  public getMetrics() { return this.request('/v1/metrics'); }
  public getMLMetrics() { return this.request('/v1/ml/metrics'); }
  public getMLSamples() { return this.request('/v1/ml/samples'); }

  public connectWebSocket(scope: SubscriptionScope, onHazard: (hazard: Hazard, alert?: DriverAlert) => void, onAck?: (data: any) => void, onConnectionChange?: (connected: boolean) => void) {
    this.disconnect();
    this.connectionStatus = onConnectionChange;
    const generation = this.connectionGeneration;
    const connect = () => {
      if (generation !== this.connectionGeneration) return;
      const socket = new WebSocket(serviceSocketUrl('/v1/relay'));
      this.ws = socket;
      socket.onopen = () => {
        if (generation !== this.connectionGeneration) { socket.close(); return; }
        this.connectionStatus?.(true);
        const envelope: EventEnvelope<SubscriptionScope> = { schemaVersion: '1.0', messageId: `sub_${Date.now()}`, eventName: 'subscription.replace', sentAt: new Date().toISOString(), inputMode: 'live', payload: scope };
        socket.send(JSON.stringify(envelope));
      };
      socket.onmessage = event => {
        if (generation !== this.connectionGeneration) return;
        try {
          const envelope: EventEnvelope = JSON.parse(event.data);
          if (envelope.eventName === 'hazard.upsert') {
            const payload = envelope.payload as { hazard: Hazard; personalizedAlert?: DriverAlert };
            onHazard(payload.hazard, payload.personalizedAlert);
          } else if (envelope.eventName === 'subscription.snapshot') {
            const payload = envelope.payload as { hazards: Hazard[] };
            payload.hazards.forEach(hazard => onHazard(hazard));
          } else if (envelope.eventName === 'ack') onAck?.(envelope.payload);
        } catch { console.warn('[MargAI] An invalid relay event was ignored.'); }
      };
      socket.onclose = () => { if (generation === this.connectionGeneration) { this.connectionStatus?.(false); this.reconnectTimer = setTimeout(connect, 3000); } };
      socket.onerror = () => socket.close();
    };
    connect();
  }
  public disconnect() {
    this.connectionGeneration++;
    this.connectionStatus?.(false);
    this.connectionStatus = undefined;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.ws; this.ws = null;
    if (socket) { socket.onclose = null; socket.onmessage = null; socket.onerror = null; socket.close(); }
  }
}
export const apiClient = new MargAIClient();
