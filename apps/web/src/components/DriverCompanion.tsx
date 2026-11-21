import React, { useEffect, useRef, useState } from 'react';
import { Activity, Camera, Car, Check, ChevronDown, CornerUpRight, Eye, Radio, Thermometer, Volume2, VolumeX } from 'lucide-react';
import { DriverAlert, Hazard, Observation, VehiclePose } from '@margai/contracts';
import { audioSynthesizer, getLocalizedMessage } from '@margai/localization';
import { apiClient } from '../services/apiClient';
import { HazardPictogram, HazardIconType } from './HazardPictogram';
import { UI_LANGUAGES, useI18n } from '../i18n';

interface DriverCompanionProps { selectedLanguage: string; }
const languages = UI_LANGUAGES.map(language => ({code:language.code, label:language.nativeName}));
const thermalModes = ['normal', 'warm', 'hot', 'critical'] as const;
type ThermalMode = typeof thermalModes[number];
const pose: VehiclePose = { latitude: 12.9372, longitude: 77.6953, headingDeg: 220, speedMps: 15, horizontalAccuracyM: 1.8 };

export const DriverCompanion: React.FC<DriverCompanionProps> = ({ selectedLanguage }) => {
  const { t } = useI18n();
  const [currentLang, setCurrentLang] = useState(selectedLanguage || 'en');
  const [view, setView] = useState<'route' | 'camera'>('route');
  const [activeAlert, setActiveAlert] = useState<DriverAlert | null>(null);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [thermalState, setThermalState] = useState<ThermalMode>('normal');
  const [isMuted, setIsMuted] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [statusMessage, setStatusMessage] = useState('Choose a scenario below.');
  const [relayConnected, setRelayConnected] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(false);
  const audioState = useRef({ currentLang, isMuted });
  audioState.current = { currentLang, isMuted };

  useEffect(() => { setCurrentLang(selectedLanguage || 'en'); }, [selectedLanguage]);

  const triggerAlert = (alert: DriverAlert) => {
    const expiresAt = Date.parse(alert.expiry);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return;
    setActiveAlert(alert);
    if (!audioState.current.isMuted) {
      audioSynthesizer.playRiskChime(alert.riskLevel);
      const phrase = getLocalizedMessage(audioState.current.currentLang, alert.messageKey as any).shortVoicePhrase;
      if (phrase) audioSynthesizer.speakLocalVoicePhrase(phrase, audioState.current.currentLang);
    }
  };

  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;
    apiClient.connectWebSocket({ clientId: `driver_${Date.now()}`, corridorId: 'blr_outer_ring_road', currentEdgeId: 'orr_south_kadubeesanahalli_main', upcomingEdgeIds: ['orr_south_bellandur_main'], vehiclePose: pose }, (hazard, alert) => {
      if (!mounted) return;
      setRelayConnected(true);
      setHazards((previous) => [hazard, ...previous.filter((item) => item.id !== hazard.id)].slice(0, 20));
      if (alert?.relevanceResult) triggerAlert(alert);
    }, undefined, connected => { if (mounted) setRelayConnected(connected); });
    apiClient.getHazards('blr_outer_ring_road').then((items) => {
      if (mounted && Array.isArray(items)) setHazards(previous => { const merged = new Map(items.map(item => [item.id, item])); previous.forEach(item => { const snapshot = merged.get(item.id); if (!snapshot || item.revision >= snapshot.revision) merged.set(item.id, item); }); return Array.from(merged.values()).slice(0,20); });
    }).catch(() => { if (mounted) setStatusMessage('Offline. You can still try the demo.'); });
    return () => { mounted = false; mountedRef.current = false; apiClient.disconnect(); };
  }, []);

  useEffect(() => {
    if (!activeAlert) return;
    const timer = window.setTimeout(() => setActiveAlert(null), Math.max(0, Date.parse(activeAlert.expiry) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [activeAlert]);

  useEffect(() => {
    let cancelled = false;
    if (view === 'camera') {
      setCameraError('');
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera preview is unavailable in this browser.');
        return;
      }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }).then((stream) => {
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => {}); }
        setCameraActive(true);
      }).catch(() => { if (!cancelled) { setCameraActive(false); setCameraError('Allow camera access to use the preview.'); } });
    }
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraActive(false);
    };
  }, [view]);

  const makeAlert = (kind: 'pothole' | 'animal' | 'curve'): DriverAlert => ({
    id: `preview_${kind}_${Date.now()}`, hazardId: `preview_${kind}`, hazardRevision: 1, relevanceResult: true,
    riskLevel: kind === 'curve' ? 'caution' : 'urgent', distanceAheadM: kind === 'pothole' ? 30 : kind === 'animal' ? 42 : 90,
    timeAheadSec: kind === 'pothole' ? 2 : kind === 'animal' ? 2.8 : 6,
    messageKey: kind === 'pothole' ? 'hazard.pothole.ahead' : kind === 'animal' ? 'hazard.animal.path_conflict' : 'road.curve.ahead',
    expiry: new Date(Date.now() + 15000).toISOString(), reasonCodes: ['SIMULATED_SCENARIO'],
  });

  const triggerPothole = async () => {
    setIsSending(true);
    triggerAlert(makeAlert('pothole'));
    const observation: Observation = {
      id: `obs_demo_${Date.now()}`, sourceId: 'veh_lead_KA03', captureTime: new Date().toISOString(),
      vehiclePose: { ...pose, latitude: 12.9365, longitude: 77.6948 },
      estimatedHazardLocation: { latitude: 12.9363, longitude: 77.6946, horizontalAccuracyM: 1.2, provenance: 'simulated' },
      perceptionOutput: [{ class: 'pothole', confidence: 0.95, bbox: { x: 0.4, y: 0.65, width: 0.25, height: 0.18 }, frameTimeMs: 16, modelVersion: 'scenario-fixture' }],
      inputMode: 'simulated',
    };
    try {
      const result = await apiClient.postObservation(observation);
      if (!mountedRef.current) return;
      if (result.error) throw new Error(result.error);
      setStatusMessage('Demo pothole shared.');
      setRelayConnected(true);
    } catch { if (mountedRef.current) { setRelayConnected(false); setStatusMessage('Preview played. Sharing is unavailable while offline.'); } }
    finally { if (mountedRef.current) setIsSending(false); }
  };

  const clearAlert = () => { setActiveAlert(null); setStatusMessage('Warning cleared for your vehicle.'); };
  const speakStatus = () => {
    if (isMuted) return;
    const phrase = activeAlert ? getLocalizedMessage(currentLang, activeAlert.messageKey as any).shortVoicePhrase : t('No active warning.');
    if (phrase) audioSynthesizer.speakLocalVoicePhrase(phrase, activeAlert ? currentLang : 'en');
  };

  let pictogram: HazardIconType = 'safe';
  if (activeAlert?.messageKey.includes('pothole')) pictogram = 'pothole';
  else if (activeAlert?.messageKey.includes('animal')) pictogram = 'cattle';
  else if (activeAlert?.messageKey.includes('curve')) pictogram = 'sharp_curve';
  else if (activeAlert?.messageKey.includes('pedestrian')) pictogram = 'pedestrian';
  else if (activeAlert?.messageKey.includes('visibility')) pictogram = 'fog';
  else if (activeAlert?.messageKey.includes('incident')) pictogram = 'incident';
  const isUrgent = activeAlert?.riskLevel === 'urgent';
  const warningTitle = pictogram === 'pothole' ? t('Pothole ahead') : pictogram === 'cattle' ? t('Animal crossing') : pictogram === 'sharp_curve' ? t('Sharp curve ahead') : pictogram === 'pedestrian' ? t('Pedestrian ahead') : pictogram === 'fog' ? t('Low visibility') : pictogram === 'incident' ? t('Incident ahead') : activeAlert ? t('Road warning') : t('No active warning');
  const thermalLabels: Record<ThermalMode, string> = { normal: t('Normal'), warm: t('Warm'), hot: t('Hot'), critical: t('Critical') };
  const selectedFps = thermalState === 'normal' ? 30 : thermalState === 'warm' ? 15 : thermalState === 'hot' ? 8 : 0;

  return (
    <div className="premium-page mx-auto max-w-6xl space-y-6 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{t('DRIVE')}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] text-[#17263e] sm:text-5xl">{t('Your road, a little clearer.')}</h1>
          <p className="mt-3 text-base text-[#67788f]">{t('Try a warning in your language.')}</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[#dce5f2] bg-white px-4 py-2 text-sm text-[#67788f]">
          <Radio size={14} className={relayConnected ? 'text-emerald-600' : 'text-[#67788f]'} />
          {relayConnected ? t('Connected demo') : t('Offline demo')}
        </span>
      </div>

      <section className="premium-panel overflow-hidden">
        <div className="flex items-center gap-3 border-b border-[#dce5f2] px-5 py-4 sm:px-7">
          <span className="rounded-xl bg-[#eaf1ff] p-2.5 text-[#2563eb]"><Car size={21} /></span>
          <div><h2 className="font-semibold text-[#17263e]">Bengaluru · Outer Ring Road</h2><p className="mt-1 text-xs text-[#67788f]">{t('Illustrative route')}</p></div>
        </div>
        <div className="relative h-[290px] overflow-hidden bg-[#eff5ff] sm:h-[350px]">
          {view === 'route' ? <RouteScene active={Boolean(activeAlert)} urgent={Boolean(isUrgent)} /> : <>
            <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${cameraActive ? '' : 'hidden'}`} />
            {!cameraActive && <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center"><Camera size={32} className="text-[#8c9bb3]" /><p className="max-w-sm text-sm text-[#67788f]">{cameraError ? t(cameraError) : t('Opening camera…')}</p></div>}
            <span className="absolute bottom-4 left-4 rounded-full bg-white/95 px-3 py-1.5 text-xs text-[#67788f]">{t('Camera preview · no detection model')}</span>
          </>}
        </div>
        <div aria-live="polite" className={`flex flex-col gap-4 border-t px-5 py-5 sm:flex-row sm:items-center sm:px-7 ${isUrgent ? 'border-[#f3d2c9] bg-[#fff4ee]' : activeAlert ? 'border-[#f3e3b7] bg-[#fff9e9]' : 'border-[#cfebdf] bg-[#edfaf3]'}`}>
          <HazardPictogram type={pictogram} size="md" />
          <div className="flex-1"><p className="text-xs font-medium uppercase tracking-wider text-[#67788f]">{activeAlert ? t('Demo warning') : t('Ready when you are')}</p><h3 className="mt-1 text-xl font-semibold text-[#17263e]">{warningTitle}</h3>{activeAlert && <p className="mt-1 text-sm text-[#67788f]">{t('{distance} m ahead', { distance: activeAlert.distanceAheadM ?? '—' })}</p>}</div>
          {activeAlert && <button onClick={clearAlert} className="premium-button-secondary self-start sm:self-center"><Check size={17} />{t('Passed hazard')}</button>}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button onClick={triggerPothole} disabled={isSending} className="premium-button justify-center py-4 disabled:opacity-60"><Activity size={19} />{isSending ? t('Sharing…') : t('Pothole ahead')}</button>
        <button onClick={() => { triggerAlert(makeAlert('animal')); setStatusMessage('Animal crossing preview.'); }} className="premium-button-secondary justify-center py-4"><Eye size={19} />{t('Animal crossing')}</button>
        <button onClick={() => { triggerAlert(makeAlert('curve')); setStatusMessage('Sharp curve preview.'); }} className="premium-button-secondary justify-center py-4"><CornerUpRight size={19} />{t('Sharp curve')}</button>
      </div>
      <p role="status" className="text-center text-sm text-[#67788f]">{t(statusMessage)}</p>

      <details className="premium-panel group">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium text-[#67788f] sm:px-7">{t('More options')}<ChevronDown size={17} className="transition-transform group-open:rotate-180" /></summary>
        <div className="grid gap-6 border-t border-[#dce5f2] p-5 sm:p-7 md:grid-cols-2">
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 font-medium text-[#17263e]"><Volume2 size={17} className="text-[#2563eb]" />{t('Audio and language')}</h3>
            <label htmlFor="driver-language" className="block text-sm text-[#67788f]">{t('Warning language')}</label>
            <select id="driver-language" value={currentLang} onChange={(event) => setCurrentLang(event.target.value)} className="w-full rounded-xl border border-[#dce5f2] bg-[#f5f8ff] p-3 text-[#17263e]">{languages.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}</select>
            <div className="flex flex-wrap gap-3"><button onClick={speakStatus} disabled={isMuted} className="premium-button-secondary disabled:opacity-40"><Volume2 size={16} />{t('Play message')}</button><button onClick={() => { setIsMuted((value) => !value); if (!isMuted && 'speechSynthesis' in window) window.speechSynthesis.cancel(); }} aria-pressed={isMuted} className="premium-button-secondary">{isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}{isMuted ? t('Unmute') : t('Mute')}</button></div>
            <p className="text-xs leading-relaxed text-[#67788f]">{t('Audio uses your device’s selected output.')}</p>
            <button onClick={() => setView((previous) => previous === 'route' ? 'camera' : 'route')} className="premium-button-secondary"><Camera size={16} />{view === 'route' ? t('Open camera preview') : t('Return to route')}</button>
          </section>
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 font-medium text-[#17263e]"><Thermometer size={17} className="text-[#2563eb]" />{t('Thermal demo')}</h3><p className="text-sm text-[#67788f]">{t('Explore the workload policy. No temperature is measured here.')}</p>
            <div className="grid grid-cols-2 gap-2">{thermalModes.map((mode) => <button key={mode} onClick={() => setThermalState(mode)} aria-pressed={thermalState === mode} className={`rounded-xl border px-3 py-3 text-sm ${thermalState === mode ? 'border-[#9ebefb] bg-[#eaf1ff] text-[#2563eb]' : 'border-[#dce5f2] bg-white text-[#67788f]'}`}>{thermalLabels[mode]}</button>)}</div>
            <p className="text-sm text-[#67788f]">{selectedFps ? t('Illustrative limit: {fps} fps', { fps: selectedFps }) : t('Illustrative state: perception paused')}</p>
            <div className="border-t border-[#dce5f2] pt-4"><h3 className="text-sm font-medium text-[#17263e]">{t('Shared observations: {count}', { count: hazards.length })}</h3><div className="mt-2 space-y-2">{hazards.slice(0, 3).map((hazard) => <p key={hazard.id} className="text-sm text-[#67788f]">{hazard.roadReference.roadName}</p>)}{!hazards.length && <p className="text-sm text-[#67788f]">{t('No observations loaded.')}</p>}</div></div>
          </section>
        </div>
      </details>
    </div>
  );
};

const RouteScene = ({ active, urgent }: { active: boolean; urgent: boolean }) => {
  const { t } = useI18n();
  return <svg viewBox="0 0 900 350" className="h-full w-full" role="img" aria-label={t('Illustrative route with two vehicles')}>
    <defs><pattern id="driver-grid" width="46" height="46" patternUnits="userSpaceOnUse"><path d="M46 0H0V46" fill="none" stroke="#dce6f3" strokeWidth=".6" /></pattern></defs>
    <rect width="900" height="350" fill="#eff5ff" /><rect width="900" height="350" fill="url(#driver-grid)" />
    <g fill="none" stroke="#dfe8f5" strokeWidth="30"><path d="M-20 58L250 123 500 45 920 112" /><path d="M-30 300L240 225 580 310 930 232" /><path d="M150-50L190 400" /><path d="M730-50L680 400" /></g>
    <path d="M410-30C380 80 530 100 480 210S430 280 460 390" fill="none" stroke="#c9d8ed" strokeWidth="67" /><path d="M410-30C380 80 530 100 480 210S430 280 460 390" fill="none" stroke="#fff" strokeWidth="54" />
    <path d="M410-30C380 80 530 100 480 210S430 280 460 390" fill="none" stroke="#8fb1eb" strokeWidth="2" strokeDasharray="8 9" />
    <circle cx="475" cy="142" r="32" fill="#2563eb" fillOpacity=".06" /><circle cx="475" cy="142" r="20" fill="#2563eb" fillOpacity=".08" />
    <g transform="translate(465 124)"><rect width="20" height="36" rx="7" fill="#2563eb" /><rect x="4" y="7" width="12" height="8" rx="2" fill="#b5d1ff" /></g>
    <g transform="translate(441 260)"><rect width="20" height="36" rx="7" fill="#35a77d" /><rect x="4" y="7" width="12" height="8" rx="2" fill="#b8f0d8" /></g>
    <g fontFamily="inherit" fontSize="14"><text x="518" y="149" fill="#2563eb">{t('Lead vehicle')}</text><text x="488" y="284" fill="#278562">{t('Your vehicle')}</text></g>
    {active && <g><circle cx="482" cy="208" r="23" fill={urgent ? '#f0a176' : '#e7c262'} fillOpacity=".2" /><circle cx="482" cy="208" r="7" fill={urgent ? '#e98b57' : '#d9af44'} /></g>}
  </svg>;
};
