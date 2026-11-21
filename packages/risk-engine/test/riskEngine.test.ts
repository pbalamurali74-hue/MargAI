import { describe, it, expect } from 'vitest';
import {
  haversineDistanceM,
  calculateBearingDeg,
  relativeDecomposition,
  analyzeRouteSharpCurves,
  assessCollisionRisk,
  evaluateHazardForDriver,
} from '../src';
import { Hazard, VehiclePose } from '@margai/contracts';

describe('MargAI Risk Engine Conformance Tests', () => {
  it('calculates accurate haversine distance between Bangalore coordinates', () => {
    // Marathahalli Bridge to Kadubeesanahalli Bridge (~2.1 km)
    const marathahalli = { latitude: 12.9554, longitude: 77.7011 };
    const kadubeesanahalli = { latitude: 12.9372, longitude: 77.6953 };
    const dist = haversineDistanceM(marathahalli, kadubeesanahalli);
    expect(dist).toBeGreaterThan(2000);
    expect(dist).toBeLessThan(2300);
  });

  it('correctly assesses a pothole ahead on the same road as urgent when close', () => {
    const vehiclePose: VehiclePose = {
      latitude: 12.935,
      longitude: 77.695,
      headingDeg: 180, // Facing South
      speedMps: 15,    // 54 km/h
      horizontalAccuracyM: 2,
    };

    const potholeHazard: Hazard = {
      id: 'h_pothole_101',
      type: 'pothole',
      revision: 1,
      location: {
        latitude: 12.93475, // ~28 meters south
        longitude: 77.695,
        horizontalAccuracyM: 1,
        provenance: 'measured',
      },
      roadReference: {
        corridorId: 'blr_outer_ring_road',
        edgeId: 'orr_south_kadubeesanahalli_main',
        roadName: 'Outer Ring Road (Southbound)',
        carriageway: 'forward',
      },
      directionApplicability: 'same_direction',
      confidence: 0.94,
      verificationState: 'corroborated',
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      expiry: new Date(Date.now() + 86400000).toISOString(),
      evidenceCount: 3,
      corroboratingSourcesCount: 2,
      evidenceIds: ['ev_1', 'ev_2'],
    };

    const alert = evaluateHazardForDriver(
      potholeHazard,
      vehiclePose,
      {
        currentCorridorId: 'blr_outer_ring_road',
        currentEdgeId: 'orr_south_kadubeesanahalli_main',
        upcomingEdgeIds: ['orr_south_bellandur_main'],
      }
    );

    expect(alert).not.toBeNull();
    expect(alert?.relevanceResult).toBe(true);
    expect(alert?.riskLevel).toBe('urgent');
    expect(alert?.messageKey).toBe('hazard.pothole.ahead');
    expect(alert?.distanceAheadM).toBeLessThanOrEqual(35);
  });

  it('suppresses alert for opposite carriageway when direction applicability is same_direction', () => {
    const vehiclePose: VehiclePose = {
      latitude: 12.935,
      longitude: 77.695,
      headingDeg: 0, // Facing North
      speedMps: 15,
      horizontalAccuracyM: 2,
    };

    const potholeSouthbound: Hazard = {
      id: 'h_pothole_south',
      type: 'pothole',
      revision: 1,
      location: {
        latitude: 12.9352,
        longitude: 77.695,
        horizontalAccuracyM: 1,
        provenance: 'measured',
      },
      roadReference: {
        corridorId: 'blr_outer_ring_road',
        edgeId: 'orr_south_kadubeesanahalli_main',
        roadName: 'Outer Ring Road (Southbound)',
        carriageway: 'reverse', // Opposite to driver
      },
      directionApplicability: 'same_direction',
      confidence: 0.9,
      verificationState: 'corroborated',
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      expiry: new Date(Date.now() + 86400000).toISOString(),
      evidenceCount: 2,
      corroboratingSourcesCount: 2,
      evidenceIds: ['ev_1'],
    };

    const alert = evaluateHazardForDriver(
      potholeSouthbound,
      vehiclePose,
      {
        currentCorridorId: 'blr_outer_ring_road',
        currentEdgeId: 'orr_north_kadubeesanahalli_main',
        upcomingEdgeIds: [],
      }
    );

    expect(alert).toBeNull();
  });

  it('removes passed hazards once distance becomes negative beyond jitter buffer', () => {
    const vehiclePose: VehiclePose = {
      latitude: 12.935,
      longitude: 77.695,
      headingDeg: 180, // Facing South
      speedMps: 15,
      horizontalAccuracyM: 2,
    };

    // Hazard is 15 meters behind (north of vehicle)
    const passedHazard: Hazard = {
      id: 'h_pothole_passed',
      type: 'pothole',
      revision: 1,
      location: {
        latitude: 12.93514, // ~15 meters North
        longitude: 77.695,
        horizontalAccuracyM: 1,
        provenance: 'measured',
      },
      roadReference: {
        corridorId: 'blr_outer_ring_road',
        edgeId: 'orr_south_kadubeesanahalli_main',
        roadName: 'Outer Ring Road',
        carriageway: 'forward',
      },
      directionApplicability: 'same_direction',
      confidence: 0.9,
      verificationState: 'corroborated',
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      expiry: new Date(Date.now() + 86400000).toISOString(),
      evidenceCount: 2,
      corroboratingSourcesCount: 2,
      evidenceIds: ['ev_1'],
    };

    const alert = evaluateHazardForDriver(
      passedHazard,
      vehiclePose,
      {
        currentCorridorId: 'blr_outer_ring_road',
        currentEdgeId: 'orr_south_kadubeesanahalli_main',
        upcomingEdgeIds: [],
      }
    );

    expect(alert).not.toBeNull();
    expect(alert?.relevanceResult).toBe(false);
    expect(alert?.messageKey).toBe('hazard.cleared');
  });

  it('detects upcoming sharp curve with advisory speed calculation', () => {
    // 90-degree right turn curve with tight radius (~45m)
    const p1 = { latitude: 12.9300, longitude: 77.6900 };
    const p2 = { latitude: 12.9304, longitude: 77.6903 };
    const p3 = { latitude: 12.9304, longitude: 77.6908 };

    const curveResult = analyzeRouteSharpCurves(
      { latitude: 12.9295, longitude: 77.6895, headingDeg: 45, speedMps: 16 },
      [p1, p2, p3],
      { sharpRadiusThresholdM: 90 }
    );

    expect(curveResult).not.toBeNull();
    expect(curveResult?.hasSharpCurve).toBe(true);
    expect(curveResult?.curveRadiusM).toBeLessThan(90);
    expect(curveResult?.advisorySpeedKmh).toBeGreaterThan(0);
    expect(curveResult?.advisorySpeedKmh).toBeLessThan(50);
  });

  it('escalates collision threat for crossing stray cattle while suppressing safe shoulder walkers', () => {
    // 1. Stray cow crossing road right into vehicle lane
    const crossingCattle = assessCollisionRisk(12.0, 2.0, {
      trackId: 'cow_1',
      class: 'animal',
      subclass: 'cow',
      confidence: 0.92,
      distanceAheadM: 28,
      lateralOffsetM: 2.5,
      lateralVelocityMps: -1.2, // moving left across lane
    });

    expect(crossingCattle.isThreat).toBe(true);
    expect(crossingCattle.riskLevel).toBe('urgent');
    expect(crossingCattle.messageKey).toBe('hazard.animal.path_conflict');

    // 2. Pedestrian safely on sidewalk with wide lateral clearance
    const safePedestrian = assessCollisionRisk(12.0, 2.0, {
      trackId: 'ped_safe_1',
      class: 'pedestrian',
      confidence: 0.88,
      distanceAheadM: 35,
      lateralOffsetM: 4.8, // 4.8m to the right on sidewalk
      lateralVelocityMps: 0,
    });

    expect(safePedestrian.isThreat).toBe(false);
    expect(safePedestrian.messageKey).toBe('none');
  });
});

import { describe as d2, it as it2, expect as ex2 } from 'vitest';
import { evaluateHazardForDriver as evalAlert } from '../src';
d2('corridor relevance (opposite carriageway & service road)', () => {
  const hazard: any = { id: 'h1', type: 'pothole', revision: 1, location: { latitude: 12.9275, longitude: 77.6842, horizontalAccuracyM: 1, provenance: 'measured' },
    roadReference: { corridorId: 'c', edgeId: 'main_fwd', roadName: 'x', carriageway: 'forward' }, directionApplicability: 'same_direction' };
  const pose = { latitude: 12.9295, longitude: 77.6870, headingDeg: 225, speedMps: 14, horizontalAccuracyM: 2 };
  it2('warns a trailing vehicle on the same edge', () => {
    const a = evalAlert(hazard, pose, { currentCorridorId: 'c', currentEdgeId: 'main_fwd', upcomingEdgeIds: [] });
    ex2(a?.relevanceResult).toBe(true);
  });
  it2('does not warn the opposite carriageway or a parallel service road', () => {
    ex2(evalAlert(hazard, { ...pose, headingDeg: 45 }, { currentCorridorId: 'c', currentEdgeId: 'main_rev', upcomingEdgeIds: [] })).toBeNull();
    ex2(evalAlert(hazard, pose, { currentCorridorId: 'c', currentEdgeId: 'service_fwd', upcomingEdgeIds: [] })).toBeNull();
  });
});
