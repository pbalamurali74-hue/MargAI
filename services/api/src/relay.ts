import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import {
  EventEnvelope,
  SubscriptionScope,
  Hazard,
  DriverAlert,
  Observation,
} from '@margai/contracts';
import { storageEngine } from './store';
import { evaluateHazardForDriver } from '@margai/risk-engine';

interface ConnectedClient {
  ws: WebSocket;
  clientId: string;
  watcher?: boolean;                 // website live map: receives every hazard + anonymised vehicle positions
  pair?: { code: string; role: 'phone' | 'car' };
  scope?: SubscriptionScope;
  lastPingMs: number;
}

export class MargAIRealtimeRelay {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ConnectedClient> = new Map();

  public init(server: HttpServer): WebSocketServer {
    this.wss = new WebSocketServer({ server, path: '/v1/relay' });

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = `client_${Math.random().toString(36).slice(2, 9)}`;
      const clientRecord: ConnectedClient = {
        ws,
        clientId,
        lastPingMs: Date.now(),
      };
      this.clients.set(clientId, clientRecord);

      ws.on('message', (data: string | Buffer) => {
        try {
          const envelope: EventEnvelope = JSON.parse(data.toString());
          this.handleIncomingEvent(clientRecord, envelope);
        } catch (err) {
          console.error('[WebSocket] Malformed message received:', err);
          this.sendEnvelope(ws, {
            schemaVersion: '1.0',
            messageId: `err_${Date.now()}`,
            eventName: 'error',
            sentAt: new Date().toISOString(),
            inputMode: 'live',
            payload: { message: 'Invalid JSON payload' },
          });
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        this.toWatchers('vehicle.gone', { vehicleId: this.publicId(clientId) });
      });

      ws.on('error', (err) => {
        console.warn(`[WebSocket] Client ${clientId} socket error:`, err);
        this.clients.delete(clientId);
      });

      // Send initial welcome ack
      this.sendEnvelope(ws, {
        schemaVersion: '1.0',
        messageId: `ack_${Date.now()}`,
        eventName: 'ack',
        sentAt: new Date().toISOString(),
        inputMode: 'live',
        payload: {
          clientId,
          status: 'connected',
          relayProvider: 'Google Cloud Run WebSocket Stream',
        },
      });
    });

    return this.wss;
  }

  /** Short anonymous id shown on the public map (never the raw client id). */
  private publicId(clientId: string) { return 'V' + clientId.slice(-4).toUpperCase(); }

  private toWatchers(eventName: EventEnvelope['eventName'], payload: unknown, inputMode: EventEnvelope['inputMode'] = 'live') {
    for (const c of this.clients.values()) {
      if (c.watcher) this.sendEnvelope(c.ws, { schemaVersion: '1.0', messageId: `w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, eventName, sentAt: new Date().toISOString(), inputMode, payload });
    }
  }

  /** Called by a timer: tells clients about hazards that have expired; reports are retained. */
  public sweepExpired() {
    for (const h of storageEngine.sweepExpired()) {
      for (const c of this.clients.values()) {
        if (c.watcher || c.scope?.corridorId === h.roadReference.corridorId) {
          this.sendEnvelope(c.ws, { schemaVersion: '1.0', messageId: `exp_${h.id}_${Date.now()}`, eventName: 'hazard.expire', sentAt: new Date().toISOString(), inputMode: 'live', payload: { hazardId: h.id, type: h.type } });
        }
      }
    }
  }

  private handleIncomingEvent(client: ConnectedClient, envelope: EventEnvelope) {
    const { eventName, payload } = envelope;

    if (eventName === 'watch.join') {
      client.watcher = true;
      this.sendEnvelope(client.ws, { schemaVersion: '1.0', messageId: `ws_${Date.now()}`, eventName: 'watch.snapshot', sentAt: new Date().toISOString(), inputMode: 'live',
        payload: { hazards: storageEngine.getHazards({ activeOnly: true }) } });
      return;
    }
    if (eventName === 'pair.join') {
      const { code, role } = payload as { code: string; role: 'phone' | 'car' };
      if (typeof code !== 'string' || !/^[A-Z0-9]{4,8}$/.test(code) || (role !== 'phone' && role !== 'car')) {
        this.sendEnvelope(client.ws, { schemaVersion: '1.0', messageId: `err_${Date.now()}`, eventName: 'error', sentAt: new Date().toISOString(), inputMode: 'live', payload: { message: 'Invalid pairing request' } });
        return;
      }
      client.pair = { code, role };
      const peers = [...this.clients.values()].filter(c => c !== client && c.pair?.code === code);
      this.sendEnvelope(client.ws, { schemaVersion: '1.0', messageId: `pj_${Date.now()}`, eventName: 'pair.status', sentAt: new Date().toISOString(), inputMode: 'live', payload: { code, role, phones: peers.filter(c => c.pair?.role === 'phone').length + (role === 'phone' ? 1 : 0), cars: peers.filter(c => c.pair?.role === 'car').length + (role === 'car' ? 1 : 0) } });
      peers.forEach(c => this.sendEnvelope(c.ws, { schemaVersion: '1.0', messageId: `pj_${Date.now()}`, eventName: 'pair.status', sentAt: new Date().toISOString(), inputMode: 'live', payload: { code, role: c.pair!.role, joined: role } }));
      return;
    }
    if (eventName === 'infotainment.push') {
      // Phone -> paired car display. Reports how many displays actually received it (delivery, not acceptance).
      if (client.pair?.role !== 'phone' || JSON.stringify(payload).length > 60000) return;
      let delivered = 0;
      for (const c of this.clients.values()) {
        if (c !== client && c.pair?.code === client.pair.code && c.pair.role === 'car') {
          this.sendEnvelope(c.ws, { schemaVersion: '1.0', messageId: envelope.messageId, eventName: 'infotainment.update', sentAt: new Date().toISOString(), inputMode: envelope.inputMode, payload });
          delivered++;
        }
      }
      this.sendEnvelope(client.ws, { schemaVersion: '1.0', messageId: `ack_${Date.now()}`, eventName: 'ack', sentAt: new Date().toISOString(), inputMode: envelope.inputMode, payload: { pushId: envelope.messageId, deliveredToDisplays: delivered } });
      return;
    }

    if (eventName === 'subscription.replace') {
      const scope = payload as SubscriptionScope;
      client.scope = scope;
      this.toWatchers('vehicle.update', { vehicleId: this.publicId(client.clientId), kind: envelope.inputMode === 'live' ? 'live' : 'simulated', pose: scope.vehiclePose }, envelope.inputMode);

      // Immediately respond with snapshot of active hazards on the corridor
      const activeHazards = storageEngine.getHazards({
        corridorId: scope.corridorId,
        activeOnly: true,
      });

      this.sendEnvelope(client.ws, {
        schemaVersion: '1.0',
        messageId: `snap_${Date.now()}`,
        eventName: 'subscription.snapshot',
        sentAt: new Date().toISOString(),
        inputMode: envelope.inputMode,
        payload: {
          clientId: client.clientId,
          corridorId: scope.corridorId,
          hazards: activeHazards,
          alerts: activeHazards
            .map((h) => evaluateHazardForDriver(h, scope.vehiclePose, {
              currentCorridorId: scope.corridorId,
              currentEdgeId: scope.currentEdgeId,
              upcomingEdgeIds: scope.upcomingEdgeIds || [],
            }))
            .filter((a) => a !== null),
        },
      });
    } else if (eventName === 'observation.submit') {
      const startMs = Date.now();
      const obs = payload as Observation;
      const { hazard, isNew, caseUpdated } = storageEngine.ingestObservation(obs);

      // Record relay latency
      storageEngine.recordLatency('server_relay', Date.now() - startMs);

      // Broadcast hazard update to all interested clients
      this.broadcastHazardUpsert(hazard, envelope.inputMode);

      // Send ack to submitter
      this.sendEnvelope(client.ws, {
        schemaVersion: '1.0',
        messageId: `ack_${Date.now()}`,
        eventName: 'ack',
        sentAt: new Date().toISOString(),
        inputMode: envelope.inputMode,
        payload: {
          observationId: obs.id,
          hazardId: hazard.id,
          revision: hazard.revision,
          isNew,
          verificationState: hazard.verificationState,
        },
      });
    } else if (eventName === 'capability.update') {
      // Driver updated thermal or camera status
    }
  }

  /**
   * Broadcasts a new or updated hazard to clients on matching corridors.
   * Computes personalized DriverAlert per client.
   */
  public broadcastHazardUpsert(hazard: Hazard, inputMode: EventEnvelope['inputMode'] = 'live') {
    const relayStartMs = Date.now();

    this.toWatchers('hazard.upsert', { hazard, personalizedAlert: null }, inputMode);

    for (const client of this.clients.values()) {
      if (!client.scope) continue;

      // Filter by corridor
      if (client.scope.corridorId !== hazard.roadReference.corridorId) {
        continue;
      }

      // Evaluate personalized driver alert
      const alert = evaluateHazardForDriver(
        hazard,
        client.scope.vehiclePose,
        {
          currentCorridorId: client.scope.corridorId,
          currentEdgeId: client.scope.currentEdgeId,
          upcomingEdgeIds: client.scope.upcomingEdgeIds || [],
        }
      );

      // Send hazard upsert envelope with optional alert
      // Only drivers for whom the hazard is relevant receive the upsert.
      if (!alert) continue;

      this.sendEnvelope(client.ws, {
        schemaVersion: '1.0',
        messageId: `haz_${hazard.id}_r${hazard.revision}_${Date.now()}`,
        eventName: 'hazard.upsert',
        sentAt: new Date().toISOString(),
        inputMode,
        payload: {
          hazard,
          personalizedAlert: alert,
        },
      });
    }

    storageEngine.recordLatency('server_relay', Date.now() - relayStartMs);
  }

  private sendEnvelope(ws: WebSocket, envelope: EventEnvelope) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(envelope));
    }
  }

  public getConnectedClientsCount(): number {
    return this.clients.size;
  }
}

export const realtimeRelay = new MargAIRealtimeRelay();
