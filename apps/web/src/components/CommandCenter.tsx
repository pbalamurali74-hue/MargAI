import { useI18n } from '../i18n';
import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  AlertTriangle,
  Volume2,
  VolumeX,
  Thermometer,
  ShieldCheck,
  MapPin,
  Send,
  CheckCircle2,
  Activity,
  Layers,
  Radio,
  Eye,
  Moon,
  Compass,
  FileText,
  Smartphone,
  QrCode,
  X,
  ExternalLink,
} from 'lucide-react';
import {
  Hazard,
  DriverAlert,
  Observation,
  VehiclePose,
  CivicCase,
} from '@margai/contracts';
import { audioSynthesizer, getLocalizedMessage } from '@margai/localization';
import { apiClient, serviceUrl, serviceSocketUrl } from '../services/apiClient';
import { AudioWaveform } from './AudioWaveform';

interface CommandCenterProps {
  selectedLanguage: string;
}

export const CommandCenter: React.FC<CommandCenterProps> = ({
  selectedLanguage,
}) => {
  const { t } = useI18n();
  const [nightHudMode, setNightHudMode] = useState<boolean>(false);
  const [activeAlert, setActiveAlert] = useState<DriverAlert | null>(null);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [cases, setCases] = useState<CivicCase[]>([]);
  const [selectedCase, setSelectedCase] = useState<CivicCase | null>(null);
  const [isAudioActive, setIsAudioActive] = useState<boolean>(false);
  const [v2vActive, setV2vActive] = useState<boolean>(false);
  const [relayConnected, setRelayConnected] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [caseBusy, setCaseBusy] = useState(false);
  const animationRef = useRef<number | null>(null);
  const phoneUrl = `${window.location.origin}/?mode=smartphone`;

  // Sensor Telemetry
  const [zAccelG, setZAccelG] = useState<number>(1.02);
  const [baroAltM, setBaroAltM] = useState<number>(914.2);
  const [speedKmh, setSpeedKmh] = useState<number>(54);

  // Camera & Canvas
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [videoSource, setVideoSource] = useState<'laptop' | 'smartphone' | 'simulation'>('simulation');
  const [showPhoneModal, setShowPhoneModal] = useState<boolean>(false);
  const [phoneConnected, setPhoneConnected] = useState<boolean>(false);
  const [phoneFps, setPhoneFps] = useState<number>(0);
  const [phoneHazardsCount, setPhoneHazardsCount] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [vehiclePose] = useState<VehiclePose>({
    latitude: 12.9372,
    longitude: 77.6953,
    headingDeg: 220,
    speedMps: 15.0,
    horizontalAccuracyM: 1.8,
  });

  useEffect(() => {
    if (videoSource === 'smartphone') return;
    const sensorInterval = setInterval(() => {
      const baseG = activeAlert ? 2.14 : 1.02;
      const jitter = (Math.random() - 0.5) * 0.08;
      setZAccelG(Math.round((baseG + jitter) * 100) / 100);

      const altJitter = (Math.random() - 0.5) * 0.4;
      setBaroAltM(Math.round((914.2 + altJitter) * 10) / 10);
    }, 200);

    return () => clearInterval(sensorInterval);
  }, [activeAlert, videoSource]);

  // Smartphone Stream Status & Frame Polling
  useEffect(() => {
    const statusInterval = setInterval(async () => {
      try {
        const res = await fetch(serviceUrl('/api/smartphone/status', true));
        if (res.ok) {
          const data = await res.json();
          setPhoneConnected(data.connected);
          setPhoneFps(data.fps || 0);
          setPhoneHazardsCount(data.active_hazards_count || 0);
          if (data.connected && videoSource === 'simulation') {
            setVideoSource('smartphone');
          }
        } else {
          setPhoneConnected(false);
        }
      } catch (e) {
        setPhoneConnected(false);
        // AI server offline
      }
    }, 1500);

    return () => clearInterval(statusInterval);
  }, [videoSource]);

  // Mirror Smartphone Frame onto Canvas when in Smartphone Mode
  useEffect(() => {
    if (videoSource !== 'smartphone') return;

    let mirrorInterval: any;
    const phoneImg = new Image();

    mirrorInterval = setInterval(async () => {
      try {
        const res = await fetch(serviceUrl('/api/smartphone/latest_frame', true));
        if (res.ok) {
          const data = await res.json();
          if (data.frame_base64 && canvasRef.current) {
            phoneImg.onload = () => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(phoneImg, 0, 0, canvas.width, canvas.height);
              }
            };
            phoneImg.src = data.frame_base64;

            if (data.telemetry?.z_accel_g) {
              setZAccelG(data.telemetry.z_accel_g);
            }
            if (data.telemetry?.speed_kmh) {
              setSpeedKmh(Math.round(data.telemetry.speed_kmh));
            }
          }
        }
      } catch (e) {
        // ignore
      }
    }, 85);

    return () => clearInterval(mirrorInterval);
  }, [videoSource]);

  useEffect(() => {
    apiClient.connectWebSocket(
      {
        clientId: 'veh_command_01',
        corridorId: 'blr_outer_ring_road',
        currentEdgeId: 'orr_south_kadubeesanahalli_main',
        upcomingEdgeIds: ['orr_south_bellandur_main'],
        vehiclePose,
      },
      (hazard: Hazard, personalizedAlert?: DriverAlert) => {
        setHazards((prev) => {
          const filtered = prev.filter((h) => h.id !== hazard.id);
          return [hazard, ...filtered];
        });

        if (personalizedAlert && personalizedAlert.relevanceResult) {
          triggerAlert(personalizedAlert);
        }
      }
    );

    apiClient.getHealth().then((health) => setRelayConnected(health.status === 'ok')).catch(() => setRelayConnected(false));
    apiClient.getHazards('blr_outer_ring_road').then(setHazards).catch(() => setHazards([]));
    apiClient.getCases().then((cList) => {
      setCases(cList);
      if (cList.length > 0) setSelectedCase(cList[0]);
    }).catch(() => setCases([]));

    return () => {
      apiClient.disconnect();
      stopCamera();
    };
  }, []);

  const triggerAlert = (alert: DriverAlert) => {
    setActiveAlert(alert);
    setV2vActive(true);
    setIsAudioActive(true);
    setTimeout(() => setV2vActive(false), 3000);
    setTimeout(() => setIsAudioActive(false), 4500);

    audioSynthesizer.playRiskChime(alert.riskLevel);
    const localized = getLocalizedMessage(selectedLanguage, alert.messageKey as any);
    if (localized.shortVoicePhrase) {
      audioSynthesizer.speakLocalVoicePhrase(localized.shortVoicePhrase, selectedLanguage);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setCameraActive(false);
      setActionNotice('Camera access was not available. Allow camera permission in a secure context, or choose the demo scenario.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startDetectionLoop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    const render = () => {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (cameraActive && videoRef.current) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grad.addColorStop(0, '#eef4ff');
        grad.addColorStop(0.5, '#e5eefb');
        grad.addColorStop(1, '#d2def1');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#a6bbda';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(canvas.width * 0.45, canvas.height * 0.38);
        ctx.lineTo(canvas.width * 0.05, canvas.height);
        ctx.moveTo(canvas.width * 0.55, canvas.height * 0.38);
        ctx.lineTo(canvas.width * 0.95, canvas.height);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 3;
        ctx.setLineDash([16, 16]);
        ctx.beginPath();
        ctx.moveTo(canvas.width * 0.5, canvas.height * 0.38);
        ctx.lineTo(canvas.width * 0.5, canvas.height);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (videoSource !== 'simulation') {
        animationRef.current = requestAnimationFrame(render);
        return;
      }

      // Clearly labelled illustrative detection in simulation mode only
      const pulse = Math.sin(frame * 0.08) * 5;
      const bx = canvas.width * 0.36 + pulse;
      const by = canvas.height * 0.58;
      const bw = 170;
      const bh = 95;
      const bCorner = 18;

      // Google Red (#EA4335) for critical pothole bounding box
      ctx.strokeStyle = '#EA4335';
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(234, 67, 53, 0.12)';
      ctx.fillRect(bx, by, bw, bh);

      ctx.beginPath();
      ctx.moveTo(bx, by + bCorner);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + bCorner, by);
      ctx.moveTo(bx + bw - bCorner, by);
      ctx.lineTo(bx + bw, by);
      ctx.lineTo(bx + bw, by + bCorner);
      ctx.moveTo(bx, by + bh - bCorner);
      ctx.lineTo(bx, by + bh);
      ctx.lineTo(bx + bCorner, by + bh);
      ctx.moveTo(bx + bw - bCorner, by + bh);
      ctx.lineTo(bx + bw, by + bh);
      ctx.lineTo(bx + bw, by + bh - bCorner);
      ctx.stroke();

      ctx.fillStyle = '#EA4335';
      ctx.fillRect(bx, by - 22, bw, 22);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(t('Demo pothole'), bx + 8, by - 6);

      animationRef.current = requestAnimationFrame(render);
    };

    render();
  };

  useEffect(() => {
    if (videoSource !== 'smartphone') startDetectionLoop();
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    };
  }, [cameraActive, videoSource, t]);

  const handleInjectPothole = async () => {
    const newObs: Observation = {
      id: `obs_${Date.now()}`,
      sourceId: 'veh_lead_KA03',
      captureTime: new Date().toISOString(),
      vehiclePose: {
        latitude: 12.9365,
        longitude: 77.6948,
        headingDeg: 220,
        speedMps: 15.0,
        horizontalAccuracyM: 1.5,
      },
      estimatedHazardLocation: {
        latitude: 12.9363,
        longitude: 77.6946,
        horizontalAccuracyM: 1.2,
        provenance: 'simulated',
      },
      perceptionOutput: [
        {
          class: 'pothole',
          confidence: 0.95,
          bbox: { x: 0.4, y: 0.65, width: 0.25, height: 0.18 },
          frameTimeMs: 16,
          depthEstimateM: 0.08,
          modelVersion: 'LiteRT-v1.4',
        },
      ],
      accelerometerPeakG: 2.3,
      inputMode: 'simulated',
    };

    try {
      await apiClient.postObservation(newObs);
      setActionNotice('Demo observation sent. The warning below is a local scenario.');
      const updatedCases = await apiClient.getCases();
      setCases(updatedCases);
      if (updatedCases.length) setSelectedCase(updatedCases[0]);
    } catch {
      setActionNotice('Backend unavailable. Playing the local demonstration only.');
    }

    triggerAlert({
      id: `alert_pothole_${Date.now()}`,
      hazardId: 'h_pothole_lead',
      hazardRevision: 1,
      relevanceResult: true,
      riskLevel: 'urgent',
      distanceAheadM: 30,
      timeAheadSec: 2.0,
      messageKey: 'hazard.pothole.ahead',
      expiry: new Date(Date.now() + 15000).toISOString(),
      reasonCodes: ['POTHOLE_IMPACT_RISK', 'V2V_BROADCAST_CORROBORATED'],
    });
  };

  const handleInjectObstacle = () => {
    triggerAlert({
      id: `alert_cattle_${Date.now()}`,
      hazardId: 'h_cattle',
      hazardRevision: 1,
      relevanceResult: true,
      riskLevel: 'urgent',
      distanceAheadM: 42,
      timeAheadSec: 2.8,
      messageKey: 'hazard.animal.path_conflict',
      expiry: new Date(Date.now() + 15000).toISOString(),
      reasonCodes: ['ROAD_OBSTACLE_CROSSING', 'CRITICAL_TTC'],
    });
  };

  const handleClearAlert = () => {
    setActiveAlert(null);
    setIsAudioActive(false);
    audioSynthesizer.playRiskChime('information');
  };

  const localizedAlert = activeAlert
    ? getLocalizedMessage(selectedLanguage, activeAlert.messageKey as any)
    : null;

  const runCaseAction = async (kind: 'draft' | 'submit') => {
    if (!selectedCase) return;
    setCaseBusy(true);
    try {
      const result = kind === 'draft'
        ? await apiClient.generateGeminiReport(selectedCase.id)
        : await apiClient.submitToAuthority(selectedCase.id);
      if (result?.error) throw new Error(result.error);
      const updated = await apiClient.getCases();
      setCases(updated);
      setSelectedCase(updated.find((item) => item.id === selectedCase.id) || updated[0] || null);
      setActionNotice(kind === 'draft' ? 'Report draft prepared for review.' : 'Demo dispatch recorded. No government portal was contacted.');
    } catch {
      setActionNotice('This action could not be completed. Check the backend connection and try again.');
    } finally {
      setCaseBusy(false);
    }
  };

  return (
    <div className="premium-page max-w-[1320px] mx-auto px-4 sm:px-6 py-8 sm:py-12 text-[#17263e]">
      <header className="mb-8"><h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">{t('One road. Shared awareness.')}</h1><p className="text-[#67788f] mt-3">{t('Observe a hazard, warn a driver, and keep the evidence.')}</p></header>
      {actionNotice && <div role="status" className="flex items-start justify-between gap-3 bg-[#eaf3ff] border border-[#cfe0fa] rounded-2xl p-4 text-sm text-[#315b99] mb-6"><span>{t(actionNotice)}</span><button aria-label={t('Dismiss message')} onClick={() => setActionNotice(null)}><X size={16} /></button></div>}
      <div className="grid lg:grid-cols-3 gap-5">
        <section className="premium-panel rounded-[26px] bg-white border border-[#dce5f2] overflow-hidden">
          <div className="flex items-center gap-3 p-5"><Camera className="text-[#2563eb]" size={19} /><h2 className="font-semibold">{t('Observe')}</h2></div>
          <div className={`relative bg-[#eaf1fd] aspect-video ${nightHudMode ? 'brightness-75' : ''}`}>
            <video ref={videoRef} playsInline muted className="hidden" />
            <canvas ref={canvasRef} width={640} height={400} className="w-full h-full object-cover" aria-label={t('Road observation preview')} />
            <span className="absolute top-3 left-3 px-3 py-1.5 text-xs rounded-full bg-white/90 text-[#526681]">{videoSource === 'simulation' ? t('Demo scenario') : videoSource === 'laptop' ? cameraActive ? t('Camera preview') : t('Camera unavailable') : phoneConnected ? t('Phone stream') : t('Waiting for phone')}</span>
          </div>
          <div className="p-5"><p className="text-sm text-[#67788f] mb-4">{t('Try a sample observation to see the journey.')}</p><button className="premium-button w-full justify-center" onClick={handleInjectPothole}><Layers size={16} />{t('Try a pothole')}</button></div>
        </section>
        <section className="premium-panel rounded-[26px] bg-white border border-[#dce5f2] flex flex-col overflow-hidden">
          <div className="p-5 flex items-center gap-3"><Compass size={19} className="text-[#2563eb]" /><h2 className="font-semibold">{t('Share')}</h2></div>
          <div className="relative min-h-[205px] bg-[#eff5ff] overflow-hidden">
            <svg viewBox="0 0 400 240" className="w-full h-full absolute inset-0" aria-label={t('Illustrated corridor with lead and trailing vehicles')} role="img">
              <path d="M-20 210L90 180Q140 160 170 105L230 20Q245-5 290-25" fill="none" stroke="#d6e4f8" strokeWidth="38" />
              <path d="M-20 210L90 180Q140 160 170 105L230 20Q245-5 290-25" fill="none" stroke="#6b99eb" strokeWidth="3" strokeDasharray="7 7" />
              <circle cx="160" cy="122" r="24" fill="#2563eb" fillOpacity=".08" /><circle cx="160" cy="122" r="8" fill="#2563eb" /><text x="181" y="127" fill="#526681" fontSize="12">{t('Lead vehicle')}</text>
              <circle cx="94" cy="180" r="8" fill="#269976" /><text x="110" y="201" fill="#526681" fontSize="12">{t('Trailing vehicle')}</text>
              {v2vActive && <circle cx="160" cy="122" r="26" fill="none" stroke="#2563eb" className="animate-ping" />}
            </svg>
          </div>
          <div className="p-5 flex-1 flex flex-col gap-4">
            {activeAlert ? <div role="status" className="bg-[#fff7e6] border border-[#f3dfb6] rounded-2xl p-4"><p className="text-xs text-[#92661e] mb-2">{t('Demo warning')}</p><p className="text-lg font-medium">{localizedAlert?.text || t(activeAlert.messageKey)}</p><p className="text-sm text-[#8b7449] mt-2">{t('{distance} m ahead', { distance: activeAlert.distanceAheadM ?? '—' })}</p></div> : <p className="text-sm text-[#67788f] leading-relaxed">{t('Relevant warnings reach drivers approaching on the same road.')}</p>}
            <div className="mt-auto">{activeAlert ? <button onClick={handleClearAlert} className="premium-button-secondary w-full justify-center">{t('Acknowledge')}</button> : <span className="text-sm text-[#67788f]">{t('Ready for an observation')}</span>}</div>
          </div>
        </section>
        <section className="premium-panel rounded-[26px] bg-white border border-[#dce5f2] flex flex-col overflow-hidden">
          <div className="p-5 flex items-center gap-3"><FileText size={19} className="text-[#2563eb]" /><h2 className="font-semibold">{t('Improve')}</h2></div>
          <div className="p-5 pt-2 flex flex-col flex-1 gap-5"><div className="bg-[#edfaf4] rounded-2xl p-5"><ShieldCheck size={30} className="text-[#269976] mb-5" /><p className="text-3xl font-semibold tabular-nums">{cases.length}</p><p className="text-sm text-[#58796e] mt-2">{t('Cases ready for review')}</p></div><p className="text-sm leading-relaxed text-[#67788f]">{t('Keep observations together and prepare a report for review.')}</p><button disabled={!selectedCase || caseBusy} onClick={() => runCaseAction('draft')} className="premium-button mt-auto w-full justify-center disabled:opacity-40"><FileText size={16} />{caseBusy ? t('Working…') : t('Prepare report')}</button></div>
        </section>
      </div>
      <details className="mt-6 rounded-2xl border border-[#dce5f2] bg-white/80"><summary className="p-5 cursor-pointer text-sm font-medium text-[#526681]">{t('Settings and details')}</summary><div className="p-5 pt-0 space-y-5"><div className="flex flex-wrap items-center gap-3"><select aria-label={t('Camera input source')} value={videoSource} onChange={(e) => { const src = e.target.value as 'laptop' | 'smartphone' | 'simulation'; setVideoSource(src); if (src === 'laptop') startCamera(); else stopCamera(); }} className="bg-[#f5f8ff] text-sm border border-[#dce5f2] rounded-xl px-3 py-3"><option value="simulation">{t('Demo scenario')}</option><option value="laptop">{t('Device camera')}</option><option value="smartphone">{t('Phone stream')}</option></select><button onClick={() => setShowPhoneModal(true)} className="premium-button-secondary"><Smartphone size={17} />{phoneConnected ? t('Phone connected') : t('Connect a phone')}</button><button onClick={() => setNightHudMode(!nightHudMode)} aria-pressed={nightHudMode} className="premium-button-secondary"><Moon size={17} />{nightHudMode ? t('Standard preview') : t('Dim preview')}</button><button className="premium-button-secondary" onClick={handleInjectObstacle}><AlertTriangle size={16} />{t('Try an animal crossing')}</button></div><div className="grid sm:grid-cols-3 gap-3 text-sm text-[#67788f]"><p>{t('Hazard records: {count}', {count: hazards.length})}</p><p>{t('Vertical acceleration: {value} G', {value: zAccelG.toFixed(2)})}</p><p>{t('Altitude: {value} m', {value: baroAltM.toFixed(1)})}</p></div><p className="text-xs text-[#67788f]">{t('Telemetry is illustrative in demo mode')}{' · '}{relayConnected ? t('Backend available') : t('Backend unavailable')}</p><AudioWaveform isActive={isAudioActive} label={isAudioActive ? t('Warning audio') : t('Audio standby')} className="w-full" />{cases.length > 0 && <div className="flex flex-wrap gap-3"><select aria-label={t('Civic case')} value={selectedCase?.id || ''} onChange={(e) => setSelectedCase(cases.find((item) => item.id === e.target.value) || null)} className="bg-[#f5f8ff] border border-[#dce5f2] rounded-xl p-3 text-sm max-w-full">{cases.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}</select><button disabled={!selectedCase || caseBusy} onClick={() => runCaseAction('submit')} className="premium-button-secondary disabled:opacity-40"><Send size={16} />{t('Simulate dispatch')}</button></div>}<p className="text-xs text-[#67788f]">{t('Dispatch is simulated. No official complaint portal is contacted.')}</p></div></details>
      {showPhoneModal && <div className="fixed inset-0 z-[80] bg-[#17263e]/25 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="phone-modal-title" onClick={() => setShowPhoneModal(false)}><div className="bg-white border border-[#dce5f2] rounded-3xl max-w-md w-full p-6 sm:p-8 relative max-h-[90vh] overflow-y-auto shadow-xl" onClick={(event) => event.stopPropagation()}><button aria-label={t('Close phone connection')} onClick={() => setShowPhoneModal(false)} className="absolute right-4 top-4 p-2 text-[#67788f]"><X size={20} /></button><Smartphone size={28} className="text-[#2563eb] mb-5" /><h2 id="phone-modal-title" className="text-2xl font-semibold">{t('Connect your phone')}</h2><p className="text-sm text-[#67788f] leading-relaxed mt-3">{t('Scan the code, allow camera access, and choose the phone stream.')}</p><div className="my-6 flex justify-center"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(phoneUrl)}`} alt={t('QR code for the phone camera view')} width={180} height={180} /></div><a href={phoneUrl} target="_blank" rel="noreferrer" className="text-sm text-[#2563eb] break-all underline underline-offset-4">{phoneUrl}</a><p className="text-xs leading-relaxed text-[#67788f] mt-4">{t('Use an accessible HTTPS address for a separate phone. Localhost works only on this device.')}</p><a href={phoneUrl} target="_blank" rel="noreferrer" className="premium-button mt-5 w-full justify-center"><ExternalLink size={16} />{t('Open phone view')}</a></div></div>}
    </div>
  );
};
