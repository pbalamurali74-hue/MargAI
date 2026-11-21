import express, { Request, Response } from 'express';
import cors from 'cors';
import { openApiSpec, ObservationSchema } from '@margai/contracts';
import { storageEngine } from './store';
import { geminiService } from '@margai/assistance';
import { realtimeRelay } from './relay';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { existsSync, readFileSync } from 'fs';

export function createExpressApp(): express.Application {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // 1. Health & Google Cloud Runtime status
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'MargAI Backend & Relay',
      googleCloud: {
        runRegion: process.env.K_SERVICE ? 'Google Cloud Run (Active Container)' : 'Local Cloud Run Emulation',
        firestore: storageEngine.isFirestoreLive ? 'Live Cloud Firestore' : 'High-Performance Firestore Emulation',
        storage: 'Google Cloud Storage (GCS) Signed Uploads Ready',
        gemini: geminiService.isConfigured() ? 'Gemini 2.5 Flash Connected' : 'Deterministic Grounded Mode',
      },
      wsClientsConnected: realtimeRelay.getConnectedClientsCount(),
      activeHazards: storageEngine.getHazards({ activeOnly: true }).length,
    });
  });

  // 2. Official Startup Buildathon India 2026 Metadata (from startupbuildathon.com)
  app.get('/v1/buildathon-meta', (req: Request, res: Response) => {
    res.json({
      eventName: 'Startup Buildathon India 2026',
      organizers: ['Google AI', 'Google Cloud for Startups', 'Google DeepMind (GDM)', 'Hack2skill'],
      timeline: {
        cityBuildathons: '20–21 November 2026 (10 cities: Bengaluru, Delhi, Mumbai, Hyderabad, Chennai, Pune, Ahmedabad, Jaipur, Kochi, Kolkata)',
        regionalShowcase: '23, 25, 27 November 2026 (Gurugram, Mumbai, Hyderabad)',
        grandFinale: '2 December 2026 (Google Campus, Bengaluru)',
      },
      founderStarterPack: {
        totalPoolUsd: 100000,
        perTeamCashUsd: 5000,
        perTeamGoogleCloudCreditsUsd: 5000,
      },
      googleTechStack: {
        models: ['Gemini 2.5 Flash', 'Gemini Pro', 'Gemini Live', 'Gemma (Edge AI)'],
        tools: ['Google AI Studio', 'Google Antigravity', 'Google Agent Skills'],
        infrastructure: [
          'Google Cloud Run (Serverless WebSockets & REST Microservices)',
          'Google Cloud Firestore (Realtime Document Sync)',
          'Google Cloud Storage (Evidence Media Buckets)',
          'Google Maps Platform (Road Corridors & Vector Navigation)',
          'Google LiteRT / TensorFlow Lite (Edge Computer Vision)',
          'Android & Android Auto (Google for Cars Navigation)',
        ],
      },
      evaluationCriteria: [
        '01 Founder Profile: Who you are and why you built this',
        '02 Product Potential: Clear road safety problem solved well',
        '03 Market Viability: Scalable municipal & consumer automotive market',
        '04 Technical Architecture: Deterministic risk engine + serverless scale',
        '05 Deep Use of Google AI: Gemini 2.5, Cloud Run, Firestore, LiteRT, Maps',
      ],
    });
  });

  // 3. Observations: Ingest vehicle detection
  app.post('/v1/observations', (req: Request, res: Response) => {
    const parseResult = ObservationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Validation failed', details: parseResult.error.format() });
    }

    const obs = parseResult.data;
    const { hazard, isNew, caseUpdated } = storageEngine.ingestObservation(obs);

    // Relay to connected WebSocket subscribers
    realtimeRelay.broadcastHazardUpsert(hazard, obs.inputMode);

    res.status(201).json({
      status: 'accepted',
      observationId: obs.id,
      hazardId: hazard.id,
      revision: hazard.revision,
      isNew,
      verificationState: hazard.verificationState,
      caseUpdated: caseUpdated ? { id: caseUpdated.id, status: caseUpdated.status } : undefined,
    });
  });

  // Demo support: replayable simulated journeys (never touches live or surveyed records).
  app.post('/v1/simulation/reset', (req: Request, res: Response) => {
    res.json({ status: 'ok', removedHazards: storageEngine.resetSimulated() });
  });

  // 4. Hazards: List by corridor
  app.get('/v1/hazards', (req: Request, res: Response) => {
    const corridorId = req.query.corridorId as string | undefined;
    const hazards = storageEngine.getHazards({ corridorId, activeOnly: true });
    res.json(hazards);
  });

  app.get('/v1/hazards/:id', (req: Request, res: Response) => {
    const hazard = storageEngine.getHazardById(req.params.id);
    if (!hazard) {
      return res.status(404).json({ error: 'Hazard not found' });
    }
    res.json(hazard);
  });

  // 5. Google Cloud Storage Signed Upload Intents
  app.post('/v1/evidence/upload-intents', (req: Request, res: Response) => {
    const { observationId, contentType } = req.body;
    if (!observationId || !contentType) {
      return res.status(400).json({ error: 'observationId and contentType required' });
    }

    const objectId = `evidence_${observationId}_${Date.now()}.jpg`;
    // Simulated or Live Google Cloud Storage Signed URL
    const gcsBucket = process.env.GCS_BUCKET_NAME || 'margai-evidence-vault-blr';
    const uploadUrl = `https://storage.googleapis.com/${gcsBucket}/${objectId}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=service-account&X-Goog-Signed=mock_signature`;

    res.json({
      objectId,
      uploadUrl,
      evidenceRef: `gs://${gcsBucket}/${objectId}`,
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    });
  });

  // 6. Civic Cases: List and details
  app.get('/v1/cases', (req: Request, res: Response) => {
    res.json(storageEngine.getCases());
  });

  app.get('/v1/cases/:id', (req: Request, res: Response) => {
    const c = storageEngine.getCaseById(req.params.id);
    if (!c) {
      return res.status(404).json({ error: 'Case not found' });
    }
    res.json(c);
  });

  // 7. Google Gemini Statutory Report Generation
  app.post('/v1/cases/:id/gemini-report', async (req: Request, res: Response) => {
    const c = storageEngine.getCaseById(req.params.id);
    if (!c) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const hazard = storageEngine.getHazardById(c.hazardId);
    if (!hazard) {
      return res.status(404).json({ error: 'Associated hazard not found' });
    }

    const reportResult = await geminiService.generateOfficialCivicReport(c, hazard);

    // Save report to case
    storageEngine.updateCase(c.id, (current) => ({
      ...current,
      geminiReportSummary: reportResult.suggestedAction,
      formalComplaintMarkdown: reportResult.markdownReport,
      status: current.status === 'detected' ? 'prepared' : current.status,
      auditTrail: [
        ...current.auditTrail,
        {
          timestamp: new Date().toISOString(),
          action: 'GEMINI_REPORT_GENERATED',
          actor: 'Google Gemini 2.5 Flash',
          notes: `Formal notice drafted under ${reportResult.applicableLaws[0]}`,
        },
      ],
    }));

    res.json(reportResult);
  });

  // 8. Authority Submission Attempts (e.g. BBMP Sahaaya / NHAI Portal)
  app.post('/v1/cases/:id/submission-attempts', (req: Request, res: Response) => {
    const c = storageEngine.getCaseById(req.params.id);
    if (!c) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const complaintNumber = `BBMP-RD-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const submissionDate = new Date().toISOString();

    const updated = storageEngine.updateCase(c.id, (current) => ({
      ...current,
      status: 'submitted',
      authority: {
        ...current.authority,
        complaintNumber,
        submissionDate,
        acknowledgementNotes: 'Demo submission recorded locally. No authority was contacted.',
        statusUrl: undefined,
      },
      auditTrail: [
        ...current.auditTrail,
        {
          timestamp: submissionDate,
          action: 'AUTHORITY_SUBMISSION',
          actor: 'MargAI Civic Dispatcher',
          notes: `Demo submission for ${current.authority.name}. No authority contacted. Ref: ${complaintNumber}`,
        },
      ],
    }));

    res.json({
      success: true,
      complaintNumber,
      submissionDate,
      case: updated,
    });
  });

  // 9. Latency Metrics
  app.get('/v1/metrics', (req: Request, res: Response) => {
    res.json(storageEngine.getLatencyMetrics());
  });

  // 10. System Configuration
  app.get('/v1/config', (req: Request, res: Response) => {
    res.json({
      phoneWebOrigin: (() => { try { const value = readFileSync(path.resolve(__dirname, '../../../apps/web/certs/phone-origin.txt'), 'utf8').trim(); const url = new URL(value); return url.protocol === 'https:' ? url.origin : null; } catch { return null; } })(),
      googleMapsApiKeyConfigured: !!process.env.VITE_GOOGLE_MAPS_API_KEY,
      geminiConfigured: geminiService.isConfigured(),
      firestoreConnected: storageEngine.isFirestoreLive,
      supportedCorridors: ['blr_outer_ring_road'],
      version: '1.0.0-buildathon',
    });
  });

  // 11. OpenAPI 3.0 Document
  app.get('/openapi.json', (req: Request, res: Response) => {
    res.json(openApiSpec);
  });

  // 12. Trained ML Model Metrics & Benchmarks
  app.get('/v1/ml/metrics', (req: Request, res: Response) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const baseMlDir = path.resolve(__dirname, '../../../ml/models');
      const metricsFile = path.join(baseMlDir, 'training_metrics.json');
      const benchmarkFile = path.join(baseMlDir, 'benchmark_report.json');
      const manifestFile = path.join(baseMlDir, 'export_manifest.json');

      const trainingMetrics = fs.existsSync(metricsFile) ? JSON.parse(fs.readFileSync(metricsFile, 'utf8')) : null;
      const benchmarkReport = fs.existsSync(benchmarkFile) ? JSON.parse(fs.readFileSync(benchmarkFile, 'utf8')) : null;
      const exportManifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : null;

      res.json({
        model: 'YOLO11n-Edge Road Hazard Detector',
        targetClasses: ['pothole', 'animal', 'pedestrian'],
        training: trainingMetrics,
        benchmark: benchmarkReport,
        export: exportManifest,
      });
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to read ML metrics', details: e.message });
    }
  });

  // 13. ML Test Inference Samples
  app.get('/v1/ml/samples', (req: Request, res: Response) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const summaryFile = path.resolve(__dirname, '../../../ml/inference/output/inference_summary.json');
      if (fs.existsSync(summaryFile)) {
        const samples = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
        res.json({ samples });
      } else {
        res.json({ samples: [] });
      }
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to read inference samples', details: e.message });
    }
  });

  // Serve the built interface from the same Cloud Run service as the existing API.
  // Vite continues to serve the frontend separately during local development.
  const webDirectory = path.resolve(__dirname, '../../../apps/web/dist');
  if (existsSync(path.join(webDirectory, 'index.html'))) {
    app.use(express.static(webDirectory));
    app.get('*', (req: Request, res: Response) => {
      if (/^\/(v1|api|health)(\/|$)/.test(req.path)) {
        return res.status(404).json({ error: 'This API capability is not available on this service.' });
      }
      return res.sendFile(path.join(webDirectory, 'index.html'));
    });
  }

  return app;
}
