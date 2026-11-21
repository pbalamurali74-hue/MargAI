import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hazard, SubscriptionScope } from '@margai/contracts';
import { MargAIClient } from './apiClient';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => this.onclose?.());

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  open() { this.onopen?.(); }
  serverClose() { this.onclose?.(); }
  serverMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }
}

const scope: SubscriptionScope = {
  clientId: 'driver-a', corridorId: 'test-corridor', currentEdgeId: 'southbound', upcomingEdgeIds: [],
  vehiclePose: { latitude: 12.93, longitude: 77.69, headingDeg: 180, speedMps: 10, horizontalAccuracyM: 3 },
};
const hazard: Hazard = {
  id: 'pothole-a', type: 'pothole', revision: 2,
  location: { latitude: 12.93, longitude: 77.69, horizontalAccuracyM: 3, provenance: 'simulated' },
  roadReference: { corridorId: 'test-corridor', edgeId: 'southbound', roadName: 'Test road', carriageway: 'forward' },
  directionApplicability: 'same_direction', confidence: 0.9, verificationState: 'unverified',
  firstSeen: '2026-11-20T10:00:00Z', lastSeen: '2026-11-20T10:00:00Z', expiry: '2026-11-21T10:00:00Z',
  evidenceCount: 1, corroboratingSourcesCount: 1, evidenceIds: [],
};
const upsert = { eventName: 'hazard.upsert', payload: { hazard } };
const clients: MargAIClient[] = [];
const newClient = () => { const client = new MargAIClient(); clients.push(client); return client; };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances = [];
  fetchMock = vi.fn();
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', {
    location: { origin: 'https://margai.test' },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
});

afterEach(() => {
  clients.splice(0).forEach(client => client.disconnect());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('MargAI relay lifecycle', () => {
  it('sends the subscription and never reconnects after intentional disconnect', () => {
    const client = newClient();
    const connection = vi.fn();
    client.connectWebSocket(scope, vi.fn(), undefined, connection);
    const socket = FakeWebSocket.instances[0];
    socket.open();
    expect(JSON.parse(socket.send.mock.calls[0][0])).toMatchObject({
      eventName: 'subscription.replace', payload: { clientId: 'driver-a', currentEdgeId: 'southbound' },
    });
    expect(connection.mock.calls).toEqual([[true]]);

    client.disconnect();
    vi.advanceTimersByTime(30000);
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(connection.mock.calls).toEqual([[true], [false]]);
  });

  it('cancels an already scheduled retry when its component disconnects', () => {
    const client = newClient();
    client.connectWebSocket(scope, vi.fn());
    FakeWebSocket.instances[0].open();
    FakeWebSocket.instances[0].serverClose();
    vi.advanceTimersByTime(1000);
    client.disconnect();
    vi.advanceTimersByTime(30000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('ignores queued callbacks from an old subscription after switching clients', () => {
    const client = newClient();
    const oldHazard = vi.fn();
    const latestHazard = vi.fn();
    const latestConnection = vi.fn();
    client.connectWebSocket(scope, oldHazard);
    const oldSocket = FakeWebSocket.instances[0];
    oldSocket.open();
    // Keep callbacks already queued by a browser before handlers are detached.
    const staleMessage = oldSocket.onmessage!;
    const staleOpen = oldSocket.onopen!;
    const staleClose = oldSocket.onclose!;

    client.connectWebSocket({ ...scope, clientId: 'driver-b' }, latestHazard, undefined, latestConnection);
    const latestSocket = FakeWebSocket.instances[1];
    latestSocket.open();
    staleMessage({ data: JSON.stringify(upsert) } as MessageEvent);
    staleOpen();
    staleClose();
    vi.advanceTimersByTime(10000);

    expect(oldHazard).not.toHaveBeenCalled();
    expect(latestHazard).not.toHaveBeenCalled();
    expect(latestConnection.mock.calls).toEqual([[true]]);
    expect(FakeWebSocket.instances).toHaveLength(2);

    latestSocket.serverMessage(upsert);
    expect(latestHazard.mock.calls).toEqual([[hazard, undefined]]);
  });

  it('reports a real connection loss and performs one retry after the delay', () => {
    const client = newClient();
    const connection = vi.fn();
    const onHazard = vi.fn();
    client.connectWebSocket(scope, onHazard, undefined, connection);
    const firstSocket = FakeWebSocket.instances[0];
    firstSocket.open();
    firstSocket.serverClose();
    expect(connection.mock.calls).toEqual([[true], [false]]);
    vi.advanceTimersByTime(2999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);

    const retrySocket = FakeWebSocket.instances[1];
    retrySocket.open();
    expect(connection.mock.calls).toEqual([[true], [false], [true]]);
    retrySocket.serverMessage({ eventName: 'subscription.snapshot', payload: { hazards: [hazard] } });
    expect(onHazard.mock.calls).toEqual([[hazard]]);
    vi.advanceTimersByTime(10000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});

describe('MargAI HTTP failures', () => {
  it('rejects HTTP errors even when the response body is valid JSON', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"unavailable"}', { status: 503, headers: { 'content-type': 'application/json' } }));
    await expect(newClient().getHealth()).rejects.toThrow('Request failed (503)');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a successful HTML fallback rather than treating it as application data', async () => {
    fetchMock.mockResolvedValue(new Response('<html>frontend fallback</html>', { status: 200, headers: { 'content-type': 'text/html' } }));
    await expect(newClient().getCases()).rejects.toThrow('The API did not return JSON');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns real JSON responses and clears the request timer', async () => {
    fetchMock.mockResolvedValue(new Response('{"status":"ok"}', { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } }));
    await expect(newClient().getHealth()).resolves.toEqual({ status: 'ok' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts a stalled request rather than leaving the workspace loading indefinitely', async () => {
    fetchMock.mockImplementation((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Request aborted', 'AbortError')));
    }));
    const request = newClient().getCases();
    const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(12000);
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });
});
