import { z } from 'zod';

export const GeoEstimateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  horizontalAccuracyM: z.number().nullable(),
  altitudeM: z.number().nullable().optional(),
  provenance: z.enum(['measured', 'estimated', 'surveyed', 'simulated']),
});

export const VehiclePoseSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  headingDeg: z.number().min(0).max(360),
  speedMps: z.number().min(0),
  horizontalAccuracyM: z.number().min(0),
  altitudeM: z.number().optional(),
});

export const FrameDetectionSchema = z.object({
  class: z.string(),
  confidence: z.number().min(0).max(1),
  bbox: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  }),
  trackId: z.string().optional(),
  frameTimeMs: z.number(),
  depthEstimateM: z.number().optional(),
  modelVersion: z.string(),
});

export const ObservationSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  captureTime: z.string().datetime(),
  vehiclePose: VehiclePoseSchema,
  estimatedHazardLocation: GeoEstimateSchema.optional(),
  evidenceRef: z.string().optional(),
  perceptionOutput: z.array(FrameDetectionSchema),
  accelerometerPeakG: z.number().optional(),
  inputMode: z.enum(['live', 'recorded_replay', 'simulated']),
});

export const RoadReferenceSchema = z.object({
  corridorId: z.string(),
  edgeId: z.string(),
  roadName: z.string(),
  carriageway: z.enum(['forward', 'reverse', 'bidirectional']),
  speedLimitKmh: z.number().optional(),
});

export const HazardSchema = z.object({
  id: z.string(),
  type: z.enum([
    'pothole',
    'pedestrian',
    'animal',
    'collision_risk',
    'suspected_incident',
    'confirmed_incident',
    'sharp_curve',
    'low_visibility',
  ]),
  revision: z.number().int().min(1),
  location: GeoEstimateSchema,
  roadReference: RoadReferenceSchema,
  directionApplicability: z.enum(['same_direction', 'opposite_direction', 'both_directions']),
  confidence: z.number().min(0).max(1),
  verificationState: z.enum(['unverified', 'corroborated', 'reviewed', 'dismissed', 'expired']),
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
  expiry: z.string().datetime(),
  evidenceCount: z.number().int().min(0),
  corroboratingSourcesCount: z.number().int().min(0),
  evidenceIds: z.array(z.string()),
  metadata: z.record(z.unknown()).optional(),
});

export const SubscriptionScopeSchema = z.object({
  clientId: z.string(),
  corridorId: z.string(),
  currentEdgeId: z.string(),
  upcomingEdgeIds: z.array(z.string()),
  vehiclePose: VehiclePoseSchema,
  radiusMeters: z.number().optional(),
});

export const EventEnvelopeSchema = z.object({
  schemaVersion: z.string(),
  messageId: z.string(),
  eventName: z.enum([
    'watch.join', 'watch.snapshot', 'vehicle.update', 'vehicle.gone',
    'pair.join', 'pair.status', 'infotainment.push', 'infotainment.update',
    'observation.submit',
    'hazard.upsert',
    'hazard.expire',
    'subscription.replace',
    'subscription.snapshot',
    'capability.update',
    'case.updated',
    'ack',
    'error',
  ]),
  sentAt: z.string().datetime(),
  inputMode: z.enum(['live', 'recorded_replay', 'simulated']),
  payload: z.unknown(),
});
