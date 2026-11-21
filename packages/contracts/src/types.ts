/**
 * MargAI Shared Contracts & Domain Models
 * Google Startup Buildathon India 2026
 */

export type HazardType =
  | 'pothole'
  | 'pedestrian'
  | 'animal'
  | 'collision_risk'
  | 'suspected_incident'
  | 'confirmed_incident'
  | 'sharp_curve'
  | 'low_visibility';

export type RiskLevel = 'information' | 'caution' | 'urgent';

export type InputMode = 'live' | 'recorded_replay' | 'simulated';

export type VerificationState =
  | 'unverified'
  | 'corroborated'
  | 'reviewed'
  | 'dismissed'
  | 'expired';

export type Provenance = 'measured' | 'estimated' | 'surveyed' | 'simulated';

export interface GeoEstimate {
  latitude: number;
  longitude: number;
  horizontalAccuracyM: number | null;
  altitudeM?: number | null;
  provenance: Provenance;
}

export interface VehiclePose {
  latitude: number;
  longitude: number;
  headingDeg: number;       // 0 - 360 clockwise from true north
  speedMps: number;         // meters per second (convert to km/h for display)
  horizontalAccuracyM: number;
  altitudeM?: number;
}

export interface FrameDetection {
  class: string;             // 'pothole', 'pedestrian', 'animal:cow', 'animal:dog', etc.
  confidence: number;        // 0.0 - 1.0
  bbox: {
    x: number;               // Normalized 0.0 - 1.0
    y: number;
    width: number;
    height: number;
  };
  trackId?: string;
  frameTimeMs: number;
  depthEstimateM?: number;
  modelVersion: string;
}

export interface Observation {
  id: string;
  sourceId: string;
  captureTime: string;       // ISO 8601 UTC
  vehiclePose: VehiclePose;
  estimatedHazardLocation?: GeoEstimate;
  evidenceRef?: string;      // Storage URL or data URI
  perceptionOutput: FrameDetection[];
  accelerometerPeakG?: number;
  inputMode: InputMode;
}

export interface RoadReference {
  corridorId: string;        // e.g., 'blr_outer_ring_road'
  edgeId: string;            // Directed edge segment ID
  roadName: string;          // e.g., 'Marathahalli - Bellandur Flyover'
  carriageway: 'forward' | 'reverse' | 'bidirectional';
  speedLimitKmh?: number;
}

export type DirectionApplicability =
  | 'same_direction'
  | 'opposite_direction'
  | 'both_directions';

export interface Hazard {
  id: string;
  type: HazardType;
  revision: number;
  location: GeoEstimate;
  roadReference: RoadReference;
  directionApplicability: DirectionApplicability;
  confidence: number;        // Aggregate confidence 0.0 - 1.0
  verificationState: VerificationState;
  firstSeen: string;         // ISO 8601 UTC
  lastSeen: string;          // ISO 8601 UTC
  expiry: string;            // ISO 8601 UTC
  evidenceCount: number;
  corroboratingSourcesCount: number;
  evidenceIds: string[];
  metadata?: Record<string, unknown>;
}

export interface DriverAlert {
  id: string;
  hazardId: string;
  hazardRevision: number;
  relevanceResult: boolean;
  riskLevel: RiskLevel;
  distanceAheadM: number | null;
  timeAheadSec: number | null;
  messageKey: string;
  spokenPhrase?: string;
  expiry: string;
  reasonCodes: string[];
}

export type CivicCaseStatus =
  | 'detected'
  | 'corroborated'
  | 'reviewed'
  | 'prepared'
  | 'submitted'
  | 'acknowledged'
  | 'repair_reported'
  | 'reverified'
  | 'closed';

export interface CivicAuthorityInfo {
  name: string;              // e.g. 'Bruhat Bengaluru Mahanagara Palike (BBMP)'
  portalId?: string;         // e.g. 'BBMP-Sahaaya-Portal'
  complaintNumber?: string;
  submissionDate?: string;
  acknowledgementNotes?: string;
  statusUrl?: string;
}

export interface CivicCase {
  id: string;
  hazardId: string;
  jurisdiction: string;      // e.g., 'Bengaluru East - Mahadevapura Ward 85'
  status: CivicCaseStatus;
  roadName: string;
  location: GeoEstimate;
  hazardType: HazardType;
  severityScore: number;     // 1 - 10
  evidenceCount: number;
  evidenceUrls: string[];
  firstObservedAt: string;
  lastObservedAt: string;
  authority: CivicAuthorityInfo;
  geminiReportSummary?: string;
  formalComplaintMarkdown?: string;
  auditTrail: Array<{
    timestamp: string;
    action: string;
    actor: string;
    notes?: string;
  }>;
}

export interface CapabilityState {
  cameraAvailable: boolean;
  perceptionState: 'active' | 'degraded' | 'suspended';
  networkState: 'connected' | 'offline' | 'reconnecting';
  audioRoute: 'car_bluetooth' | 'phone_speaker';
  thermalState: 'normal' | 'warm' | 'hot' | 'critical' | 'recovering';
  language: string;
  fpsLimit: number;
}

export interface EventEnvelope<T = unknown> {
  schemaVersion: string;
  messageId: string;
  eventName:
    | 'watch.join'
    | 'watch.snapshot'
    | 'vehicle.update'
    | 'vehicle.gone'
    | 'pair.join'
    | 'pair.status'
    | 'infotainment.push'
    | 'infotainment.update'
    | 'observation.submit'
    | 'hazard.upsert'
    | 'hazard.expire'
    | 'subscription.replace'
    | 'subscription.snapshot'
    | 'capability.update'
    | 'case.updated'
    | 'ack'
    | 'error';
  sentAt: string;            // UTC ISO 8601
  inputMode: InputMode;
  payload: T;
}

export interface SubscriptionScope {
  clientId: string;
  corridorId: string;
  currentEdgeId: string;
  upcomingEdgeIds: string[];
  vehiclePose: VehiclePose;
  radiusMeters?: number;
}
