import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import QRCode from 'qrcode';
import {audioSynthesizer, getLocalizedMessage} from '@margai/localization';
import {LiveRelay, Pose, scopeFor} from '../live/relay';
import {useI18n} from '../i18n';
import {Det, MediaPipeDetector, YoloDetector, mergeDets} from '../driver/detect';
import {Tracker, Track} from '../driver/tracker';
import {MotionSensor, deviceId, distanceAheadM, fogStat, makePairCode, projectAhead} from '../driver/signals';
import '../driver.css';

type InputMode = 'live' | 'recorded_replay';
type Level = 'information' | 'caution' | 'urgent';
type Cls = 'pothole' | 'animal' | 'pedestrian' | 'fog' | 'accident' | 'collision_risk';
type AlertEntry = {alert: any; hazard: any};
type Counts = Record<string, {seen: number; sent: number; acked: number}>;
const CLASS_COLOR: Record<string, string> = {pothole: '#ffc23d', animal: '#ff8a3d', pedestrian: '#ff5d73', vehicle: '#3dd5f3'};
const LEVEL_RANK: Record<string, number> = {information: 0, caution: 1, urgent: 2};
const MP_LABEL = 'MediaPipe EfficientDet-Lite0';

export const DriverApp: React.FC<{onNavigate?: (tab: any) => void}> = ({onNavigate}) => {
  const {t, language} = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const frameCv = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const fogCv = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const relayRef = useRef<LiveRelay | null>(null);
  const yolo = useRef(new YoloDetector());
  const mp = useRef(new MediaPipeDetector());
  const tracker = useRef(new Tracker());
  const motion = useRef(new MotionSensor());
  const sourceId = useRef(deviceId());
  const mode = useRef<InputMode>('live');
  const running = useRef(false);
  const stream = useRef<MediaStream | null>(null);
  const wakeLock = useRef<any>(null);
  const t0 = useRef(0);
  const poseRef = useRef<Pose | null>(null);
  const speedHist = useRef<{t: number; v: number}[]>([]);
  const compass = useRef<number | null>(null);
  const lastGpsHeading = useRef<number | null>(null);
  const lastFix = useRef<{lat: number; lon: number; t: number} | null>(null);
  const alertsRef = useRef(new Map<string, AlertEntry>());
  const spoken = useRef({id: '', rank: -1});
  const lastDetCount = useRef(0);
  const emaMs = useRef(0);
  const powerSaver = useRef(false);
  const fogRun = useRef({n: 0, last: 0, sent: 0});
  const clsSent = useRef<Record<string, number>>({});
  const colSent = useRef<Record<string, number>>({});
  const lastAlertPush = useRef(0);
  const muted = useRef(false);
  const langRef = useRef(language);
  const accidentRef = useRef<{deadline: number; peakG: number} | null>(null);
  langRef.current = language;

  const [phase, setPhase] = useState<'idle' | 'loading' | 'running'>('idle');
  const [source, setSource] = useState<InputMode | null>(null);
  const [camError, setCamError] = useState<null | 'denied' | 'unsupported' | 'failed'>(null);
  const [loadMsg, setLoadMsg] = useState('');
  const [models, setModels] = useState({yolo: false, mp: false, mpErr: false});
  const [stats, setStats] = useState({fps: 0, yoloMs: 0, mpMs: 0, saver: false, tracks: 0});
  const [gps, setGps] = useState<{ok: boolean; acc: number | null; denied: boolean}>({ok: false, acc: null, denied: false});
  const [counts, setCounts] = useState<Counts>({});
  const [relayUp, setRelayUp] = useState(false);
  const [code] = useState(() => { try { const c = sessionStorage.getItem('margai-pair-code'); if (c && /^[A-Z0-9]{4}$/.test(c)) return c; const n = makePairCode(); sessionStorage.setItem('margai-pair-code', n); return n; } catch { return makePairCode(); } });
  const [qr, setQr] = useState('');
  const [sheet, setSheet] = useState(false);
  const [carLink, setCarLink] = useState<{lastAckAt: number; delivered: number | null; joined: boolean}>({lastAckAt: 0, delivered: null, joined: false});
  const [now, setNow] = useState(Date.now());
  const [alertsVer, setAlertsVer] = useState(0);
  const [local, setLocal] = useState<null | {text: string; level: Level; until: number}>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [toast, setToast] = useState('');
  const [fog, setFog] = useState<null | {foggy: boolean; run: number}>(null);
  const [motionState, setMotionState] = useState<'off' | 'on' | 'unavailable'>('off');
  const [accident, setAccident] = useState<null | {left: number; peakG: number}>(null);

  const say = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(cur => (cur === m ? '' : cur)), 3500); }, []);
  const bump = (cls: string, k: 'seen' | 'sent' | 'acked') => setCounts(c => ({...c, [cls]: {...{seen: 0, sent: 0, acked: 0}, ...c[cls], [k]: (c[cls]?.[k] ?? 0) + 1}}));

  /* ---------- relay, pairing, alerts ---------- */
  useEffect(() => {
    const relay = new LiveRelay(); relayRef.current = relay; relay.onStatus = setRelayUp;
    relay.whenOpen(() => { setRelayUp(true); relay.send('pair.join', {code, role: 'phone'}); });
    const offs = [
      relay.on('pair.status', e => { const p = e.payload; if (p?.joined === 'car') setCarLink(c => ({...c, joined: true})); else if (typeof p?.cars === 'number') setCarLink(c => ({...c, joined: p.cars > 0})); }),
      relay.on('ack', e => {
        const p = e.payload;
        if (typeof p?.deliveredToDisplays === 'number') setCarLink({lastAckAt: Date.now(), delivered: p.deliveredToDisplays, joined: p.deliveredToDisplays > 0});
        if (p?.observationId) { const cls = obsClass.current.get(p.observationId); if (cls) bump(cls, 'acked'); }
      }),
      relay.on('subscription.snapshot', e => {
        const hz = new Map<string, any>((e.payload?.hazards ?? []).map((h: any) => [h.id, h]));
        const m = new Map<string, AlertEntry>();
        for (const a of e.payload?.alerts ?? []) if (a) m.set(a.hazardId, {alert: a, hazard: hz.get(a.hazardId)});
        alertsRef.current = m; setAlertsVer(v => v + 1);
      }),
      relay.on('hazard.upsert', e => { const a = e.payload?.personalizedAlert; if (a) { alertsRef.current.set(a.hazardId, {alert: a, hazard: e.payload.hazard}); setAlertsVer(v => v + 1); } }),
      relay.on('hazard.expire', e => { alertsRef.current.delete(e.payload?.hazardId); setAlertsVer(v => v + 1); }),
    ];
    return () => { offs.forEach(o => o()); relay.close(); relayRef.current = null; };
  }, [code]);
  const obsClass = useRef(new Map<string, string>());

  useEffect(() => { QRCode.toDataURL(`${location.origin}/?view=car&code=${code}`, {margin: 1, width: 240, color: {dark: '#1b1750', light: '#ffffff'}}).then(setQr).catch(() => setQr('')); }, [code]);

  const topAlert = useMemo(() => {
    let best: AlertEntry | null = null;
    for (const e of alertsRef.current.values()) {
      const a = e.alert; if (a.relevanceResult === false || (a.expiry && Date.parse(a.expiry) < now)) continue;
      if (!best || (a.distanceAheadM ?? 1e9) < (best.alert.distanceAheadM ?? 1e9)) best = e;
    }
    return best;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertsVer, now]);
  const alertText = useMemo(() => topAlert ? getLocalizedMessage(language, topAlert.alert.messageKey) : null, [topAlert, language]);

  const feedback = useCallback((level: Level, phrase: string) => {
    if (!muted.current) { try { audioSynthesizer.playRiskChime(level); } catch { /* audio optional */ } if (phrase) { try { audioSynthesizer.speakLocalVoicePhrase(phrase, langRef.current); } catch { /* speech optional */ } } }
    try { navigator.vibrate?.(level === 'urgent' ? [250, 100, 250, 100, 400] : level === 'caution' ? [200, 100, 200] : [80]); } catch { /* optional */ }
  }, []);

  useEffect(() => { // new / escalated server alert -> chime, voice, vibration, car
    if (!topAlert || !alertText) return;
    const a = topAlert.alert, rank = LEVEL_RANK[a.riskLevel] ?? 0;
    if (spoken.current.id === a.hazardId && spoken.current.rank >= rank) return;
    spoken.current = {id: a.hazardId, rank};
    feedback(a.riskLevel, alertText.shortVoicePhrase);
    pushAlert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topAlert, alertText]);
  const topRef = useRef<{e: AlertEntry | null; text: string}>({e: null, text: ''});
  topRef.current = {e: topAlert, text: alertText?.text ?? ''};
  function pushAlert() {
    const e = topRef.current.e; if (!e) return; lastAlertPush.current = Date.now();
    relayRef.current?.send('infotainment.push', {kind: 'alert', alert: e.alert, hazardType: e.hazard?.type ?? null, text: topRef.current.text, level: e.alert.riskLevel}, mode.current);
  }

  /* ---------- publishing ---------- */
  const submit = useCallback((cls: Cls, conf: number, box: {x: number; y: number; w: number; h: number} | null, opts: {trackId?: string; model: string; ahead?: number | null; lateral?: number; accel?: number; frameMs?: number; inputMode?: InputMode}) => {
    const pose = poseRef.current, relay = relayRef.current;
    if (!pose) { say(t('Waiting for GPS — not shared')); return false; }
    const ahead = opts.ahead ?? 0; const [lat, lon] = ahead > 0 ? projectAhead(pose.latitude, pose.longitude, pose.headingDeg, ahead, opts.lateral ?? 0) : [pose.latitude, pose.longitude];
    const b = box ?? {x: 0, y: 0, w: 1, h: 1}; const id = `obs_${sourceId.current.slice(4, 10)}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const obs: any = {
      id, sourceId: sourceId.current, captureTime: new Date().toISOString(), vehiclePose: pose,
      estimatedHazardLocation: {latitude: lat, longitude: lon, horizontalAccuracyM: Math.max(15, Math.round(pose.horizontalAccuracyM)), provenance: 'estimated'},
      perceptionOutput: [{class: cls, confidence: Math.max(0, Math.min(1, conf)), bbox: {x: b.x, y: b.y, width: b.w, height: b.h}, ...(opts.trackId ? {trackId: opts.trackId} : {}), frameTimeMs: Math.round(opts.frameMs ?? performance.now() - t0.current), modelVersion: opts.model}],
      inputMode: opts.inputMode ?? mode.current,
    };
    if (opts.accel != null) obs.accelerometerPeakG = Math.round(opts.accel * 100) / 100;
    if (!relay?.send('observation.submit', obs, obs.inputMode)) { say(t('Not connected — report not sent')); return false; }
    obsClass.current.set(id, cls); bump(cls, 'sent'); return true;
  }, [say, t]);

  const maybePublishTrack = useCallback((tr: Track, frameMs: number) => {
    if (tr.cls === 'vehicle' || !tr.confirmed) return;
    const nowMs = Date.now();
    if (tr.sentAt === 0) bump(tr.cls, 'seen');
    if (nowMs - tr.sentAt < 20000) return;
    if (nowMs - (clsSent.current[tr.cls] ?? 0) < 6000) return;
    const b = tr.box, cx = b.x + b.w / 2;
    if (submit(tr.cls, tr.conf, b, {trackId: tr.id, model: tr.src, ahead: distanceAheadM(b.y + b.h), lateral: (cx - 0.5) * 3, frameMs})) { tr.sentAt = nowMs; clsSent.current[tr.cls] = nowMs; }
    else tr.sentAt = tr.sentAt || nowMs - 17000; // retry in ~3 s
  }, [submit]);

  const localWarn = useCallback((text: string, level: Level, phrase: string) => {
    setLocal({text, level, until: Date.now() + 5000}); feedback(level, phrase);
    relayRef.current?.send('infotainment.push', {kind: 'alert', alert: null, hazardType: 'collision_risk', text, level}, mode.current);
  }, [feedback]);

  /* ---------- GPS / compass ---------- */
  useEffect(() => {
    if (!('geolocation' in navigator)) { setGps({ok: false, acc: null, denied: true}); return; }
    const id = navigator.geolocation.watchPosition(p => {
      const c = p.coords, tNow = Date.now(); let speed = c.speed ?? NaN;
      const prev = lastFix.current;
      if (!Number.isFinite(speed) && prev) { const dt = (tNow - prev.t) / 1000; if (dt > 0.3) { const dy = (c.latitude - prev.lat) * 111320, dx = (c.longitude - prev.lon) * 111320 * Math.cos(c.latitude * Math.PI / 180); speed = Math.hypot(dx, dy) / dt; } }
      lastFix.current = {lat: c.latitude, lon: c.longitude, t: tNow};
      speed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
      if (c.heading != null && Number.isFinite(c.heading) && speed > 1) lastGpsHeading.current = c.heading;
      const hd = lastGpsHeading.current ?? compass.current ?? 0;
      poseRef.current = {latitude: c.latitude, longitude: c.longitude, headingDeg: ((hd % 360) + 360) % 360, speedMps: speed, horizontalAccuracyM: c.accuracy ?? 30};
      speedHist.current.push({t: performance.now(), v: speed}); speedHist.current = speedHist.current.filter(s => performance.now() - s.t < 4000);
      setGps({ok: true, acc: c.accuracy ?? null, denied: false});
    }, err => setGps(g => ({...g, ok: false, denied: err.code === 1})), {enableHighAccuracy: true, maximumAge: 1000, timeout: 20000});
    const onOri = (e: any) => { const h = typeof e.webkitCompassHeading === 'number' ? e.webkitCompassHeading : e.absolute && e.alpha != null ? 360 - e.alpha : null; if (h != null && Number.isFinite(h)) { compass.current = h; if (poseRef.current && lastGpsHeading.current == null) poseRef.current = {...poseRef.current, headingDeg: ((h % 360) + 360) % 360}; } };
    window.addEventListener('deviceorientationabsolute', onOri as any); window.addEventListener('deviceorientation', onOri as any);
    return () => { navigator.geolocation.clearWatch(id); window.removeEventListener('deviceorientationabsolute', onOri as any); window.removeEventListener('deviceorientation', onOri as any); };
  }, []);

  /* ---------- 1 Hz: subscription + car pose push ---------- */
  useEffect(() => {
    const id = window.setInterval(() => {
      const relay = relayRef.current, pose = poseRef.current; setNow(Date.now());
      if (pose) relay?.send('subscription.replace', scopeFor(sourceId.current, pose), mode.current);
      relay?.send('infotainment.push', {kind: 'pose', pose: pose ?? null, detections: lastDetCount.current}, mode.current);
      if (topRef.current.e && Date.now() - lastAlertPush.current > 5000) pushAlert();
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const delivered = carLink.delivered != null && now - carLink.lastAckAt < 4000 ? carLink.delivered : null;
  const carConnected = delivered != null ? delivered > 0 : carLink.joined;

  /* ---------- accelerometer ---------- */
  useEffect(() => {
    const m = motion.current;
    m.onImpact = ({peakG}) => {
      const tNow = performance.now(); const hist = speedHist.current;
      const vNow = poseRef.current?.speedMps ?? 0, vBefore = hist.filter(s => tNow - s.t <= 3000).reduce((mx, s) => Math.max(mx, s.v), 0);
      if (peakG > 4.5 && vBefore >= 5 && vBefore - vNow >= 5 && !accidentRef.current) { accidentRef.current = {deadline: Date.now() + 8000, peakG}; setAccident({left: 8, peakG}); feedback('urgent', ''); return; }
      const near = tracker.current.tracks.find(x => x.cls === 'pothole' && x.hits >= 2 && performance.now() - t0.current - x.lastMs <= 2000);
      if (near) { const b = near.box; if (submit('pothole', Math.min(1, near.conf + 0.1), b, {trackId: near.id, model: `${near.src}+accelerometer`, ahead: distanceAheadM(b.y + b.h), accel: peakG})) say(t('Impact {g} g matched a detected pothole', {g: peakG.toFixed(1)})); }
    };
    return () => { m.onImpact = () => {}; };
  }, [feedback, submit, say, t]);
  useEffect(() => {
    if (!accident) return;
    const id = window.setInterval(() => {
      const a = accidentRef.current; if (!a) return; const left = Math.ceil((a.deadline - Date.now()) / 1000);
      if (left <= 0) { submit('accident', 0.6, null, {model: 'accel_speed_drop_v1', accel: a.peakG}); accidentRef.current = null; setAccident(null); say(t('Suspected incident sent')); } else setAccident({left, peakG: a.peakG});
    }, 250);
    return () => window.clearInterval(id);
  }, [!!accident]); // eslint-disable-line react-hooks/exhaustive-deps
  const cancelAccident = () => { accidentRef.current = null; setAccident(null); };

  /* ---------- camera / clip / loop ---------- */
  const draw = useCallback((tracks: Track[], dets: Det[]) => {
    const cv = overlayRef.current, v = videoRef.current; if (!cv || !v || !v.videoWidth) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), cw = cv.clientWidth, ch = cv.clientHeight;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    const c = cv.getContext('2d')!; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cw, ch);
    const sc = Math.max(cw / v.videoWidth, ch / v.videoHeight), ox = (cw - v.videoWidth * sc) / 2, oy = (ch - v.videoHeight * sc) / 2;
    void dets; c.lineWidth = 3; c.font = '700 12px system-ui,sans-serif';
    for (const tr of tracks) {
      if (tr.misses > 0) continue; const b = tr.box, col = CLASS_COLOR[tr.cls] ?? '#fff';
      const x = ox + b.x * v.videoWidth * sc, y = oy + b.y * v.videoHeight * sc, w = b.w * v.videoWidth * sc, h = b.h * v.videoHeight * sc;
      c.strokeStyle = col; c.setLineDash(tr.confirmed ? [] : [6, 5]); c.strokeRect(x, y, w, h); c.setLineDash([]);
      const label = `${tr.cls}${b.label && b.label !== tr.cls ? ` (${b.label})` : ''} ${Math.round(tr.conf * 100)}%${tr.ttcS != null ? ` · ~${tr.ttcS.toFixed(1)}s` : ''}`;
      const tw = c.measureText(label).width + 10; c.fillStyle = col; c.fillRect(x, Math.max(0, y - 18), tw, 18); c.fillStyle = '#1b1750'; c.fillText(label, x + 5, Math.max(13, y - 5));
    }
  }, []);

  const loop = useCallback(async () => {
    const v = videoRef.current; let frames = 0, fpsT = performance.now();
    while (running.current) {
      const ts = performance.now();
      if (v && v.readyState >= 2 && v.videoWidth) {
        const W = 480, H = Math.round(480 * v.videoHeight / v.videoWidth), fc = frameCv.current; if (fc.width !== W || fc.height !== H) { fc.width = W; fc.height = H; }
        fc.getContext('2d', {willReadFrequently: true})!.drawImage(v, 0, 0, W, H);
        const frameMs = mode.current === 'recorded_replay' ? v.currentTime * 1000 : ts - t0.current;
        let a: Det[] = [], b: Det[] = [];
        try { if (yolo.current.ready) a = await yolo.current.detect(fc, W, H); } catch (e) { console.warn('yolo', e); }
        try { if (mp.current.ready) b = mp.current.detect(fc); } catch (e) { console.warn('mediapipe', e); }
        const dets = mergeDets(a, b); lastDetCount.current = dets.length;
        const tracks = tracker.current.update(dets, ts - t0.current); draw(tracks, dets);
        for (const tr of tracks) {
          maybePublishTrack(tr, frameMs);
          if (tr.confirmed && tr.ttcS != null && tr.ttcS < 4 && tr.cls !== 'pothole' && Date.now() - (colSent.current[tr.id] ?? 0) > 10000) {
            colSent.current[tr.id] = Date.now(); const s = Math.max(1, Math.round(tr.ttcS));
            localWarn(t('Possible collision risk — about {s} s (estimate)', {s}), 'urgent', getLocalizedMessage(langRef.current, 'hazard.pedestrian.path_conflict').shortVoicePhrase);
            submit('collision_risk', Math.min(0.9, tr.conf), tr.box, {trackId: tr.id, model: `ttc_scale_growth_v1(${tr.src})`, ahead: distanceAheadM(tr.box.y + tr.box.h), frameMs}); bump('collision_risk', 'seen');
          }
        }
        if (ts - fogRun.current.last > 2000) { // visibility heuristic ~every 2 s
          fogRun.current.last = ts; const f = fogStat(fc, fogCv.current); fogRun.current.n = f.foggy ? fogRun.current.n + 1 : 0; setFog({foggy: fogRun.current.n >= 4, run: fogRun.current.n});
          if (fogRun.current.n >= 4 && Date.now() - fogRun.current.sent > 120000 && submit('fog', Math.min(0.8, 0.45 + (f.dark - 0.5)), null, {model: 'visibility_heuristic_dcp_v1', frameMs})) { fogRun.current.sent = Date.now(); bump('fog', 'seen'); }
        }
        frames++; const total = yolo.current.ms + mp.current.ms; emaMs.current = emaMs.current ? emaMs.current * 0.8 + total * 0.2 : total;
        if (!powerSaver.current && emaMs.current > 250) powerSaver.current = true; else if (powerSaver.current && emaMs.current < 150) powerSaver.current = false;
        if (ts - fpsT > 1000) { setStats({fps: Math.round(frames * 1000 / (ts - fpsT) * 10) / 10, yoloMs: Math.round(yolo.current.ms), mpMs: Math.round(mp.current.ms), saver: powerSaver.current, tracks: tracker.current.tracks.filter(x => x.misses === 0).length}); frames = 0; fpsT = ts; }
      }
      const interval = powerSaver.current ? 500 : 150; const spent = performance.now() - ts;
      await new Promise(r => setTimeout(r, Math.max(30, interval - spent)));
    }
  }, [draw, maybePublishTrack, localWarn, submit, t]);

  const acquireWake = async () => { try { wakeLock.current = await (navigator as any).wakeLock?.request('screen'); } catch { /* optional */ } };
  useEffect(() => { const f = () => { if (document.visibilityState === 'visible' && running.current) acquireWake(); }; document.addEventListener('visibilitychange', f); return () => document.removeEventListener('visibilitychange', f); }, []);

  const stop = useCallback(() => {
    running.current = false; stream.current?.getTracks().forEach(tk => tk.stop()); stream.current = null;
    const v = videoRef.current; if (v) { v.pause(); v.srcObject = null; v.removeAttribute('src'); v.load(); }
    try { wakeLock.current?.release(); } catch { /* ignore */ } wakeLock.current = null; motion.current.stop(); setMotionState('off');
    tracker.current.reset(); accidentRef.current = null; setAccident(null); setSource(null); setPhase('idle'); setStats(s => ({...s, fps: 0, tracks: 0, saver: false}));
    overlayRef.current?.getContext('2d')?.clearRect(0, 0, 9999, 9999);
  }, []);
  useEffect(() => () => { running.current = false; stream.current?.getTracks().forEach(tk => tk.stop()); motion.current.stop(); try { wakeLock.current?.release(); } catch { /* ignore */ } }, []);

  const start = useCallback(async (want: InputMode) => {
    if (running.current || phase === 'loading') return;
    const v = videoRef.current; if (!v) return;
    setCamError(null); setPhase('loading'); setLoadMsg(t('Starting camera…'));
    // Permission prompts must originate from this tap: motion/orientation first, without blocking.
    const D: any = (window as any).DeviceOrientationEvent; try { D?.requestPermission?.(); } catch { /* optional */ }
    const motionP = motion.current.start();
    try {
      if (want === 'live') {
        if (!navigator.mediaDevices?.getUserMedia) { setCamError('unsupported'); setPhase('idle'); return; }
        try { stream.current = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}, audio: false}); }
        catch (e: any) { setCamError(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'denied' : 'failed'); setPhase('idle'); return; }
        v.srcObject = stream.current; mode.current = 'live';
      } else { v.srcObject = null; v.src = '/road_sample.mp4'; v.loop = true; mode.current = 'recorded_replay'; }
      v.muted = true; v.playsInline = true; await v.play().catch(() => new Promise(r => setTimeout(r, 600)).then(() => v.play())).catch(() => { /* page hidden: loop waits for frames */ });
      setSource(want); setLoadMsg(t('Loading on-device models…'));
      const jobs: Promise<void>[] = [];
      if (!yolo.current.ready) jobs.push(yolo.current.load().then(() => setModels(m => ({...m, yolo: true}))).catch(e => { console.warn('YOLO load failed', e); }));
      else setModels(m => ({...m, yolo: true}));
      if (!mp.current.ready) jobs.push(mp.current.load().then(() => setModels(m => ({...m, mp: true, mpErr: false}))).catch(e => { console.warn('MediaPipe load failed', e); setModels(m => ({...m, mpErr: true})); }));
      else setModels(m => ({...m, mp: true}));
      await Promise.all(jobs);
      if (!yolo.current.ready && !mp.current.ready) { say(t('Detection models could not load')); stop(); return; }
      setMotionState((await motionP) ? 'on' : 'unavailable');
      t0.current = performance.now(); emaMs.current = 0; powerSaver.current = false; running.current = true; setPhase('running'); acquireWake();
      void loop();
    } catch (e) { console.warn(e); say(t('Could not start')); stop(); }
  }, [phase, loop, say, stop, t]);

  const toggleMute = () => { muted.current = !muted.current; setIsMuted(muted.current); if (muted.current) window.speechSynthesis?.cancel(); };
  const report = (cls: Cls, label: string) => { if (submit(cls, 1, null, {model: 'user_report', inputMode: mode.current})) { bump(cls, 'seen'); say(t('{what} reported', {what: label})); } };

  const level: Level | null = local && local.until > now ? local.level : topAlert ? topAlert.alert.riskLevel : null;
  const cardText = local && local.until > now ? local.text : alertText?.text ?? '';
  const dist = topAlert?.alert.distanceAheadM;
  const total = (k: 'seen' | 'sent' | 'acked') => Object.values(counts).reduce((s, c) => s + c[k], 0);
  const modeLabel = source === 'recorded_replay' ? t('RECORDED REPLAY (sample clip)') : source === 'live' ? t('LIVE') : t('Not recording');
  const reports: {cls: Cls; emoji: string; label: string}[] = [{cls: 'pothole', emoji: '🕳️', label: t('Pothole')}, {cls: 'animal', emoji: '🐄', label: t('Cattle')}, {cls: 'fog', emoji: '🌫️', label: t('Fog')}, {cls: 'accident', emoji: '💥', label: t('Accident')}];

  return <div className="drv-root" data-testid="driver-app">
    <video ref={videoRef} className="drv-video" playsInline muted autoPlay aria-label={t('Camera view')}/>
    <canvas ref={overlayRef} className="drv-overlay" aria-hidden="true"/>
    {phase !== 'running' && !camError && <div className="drv-hero"><div className="drv-logo">MargAI</div><p>{t('Tap Start to record the road and warn drivers around you. Detection runs on this phone.')}</p></div>}
    {camError && <div className="drv-error glass" role="alert">
      <h2>{camError === 'denied' ? t('Camera permission denied') : camError === 'unsupported' ? t('Camera not available here') : t('Camera could not be opened')}</h2>
      <p>{camError === 'denied' ? t('Allow camera access in your browser settings, then try again.') : t('This device or browser cannot provide a camera stream.')}</p>
      <button className="btn3d violet" onClick={() => start('live')}>{t('Try again')}</button>
      <button className="btn3d white" onClick={() => start('recorded_replay')}>{t('Try a sample clip')}</button>
      <small>{t('The sample clip is a pre-recorded video, labelled Recorded replay. Nothing in it is live.')}</small>
    </div>}
    <header className="drv-top glass" role="status">
      <button className="drv-x" onClick={() => { stop(); onNavigate?.('public'); }} aria-label={t('Close')}>✕</button>
      <div className="drv-pillrow">
        <span className={`drv-dot ${gps.ok ? 'ok' : 'bad'}`}/>{gps.ok ? t('GPS ±{m} m', {m: Math.round(gps.acc ?? 0)}) : gps.denied ? t('GPS off') : t('GPS searching')}
        <span className="drv-sep"/>
        <span className={`drv-dot ${models.yolo ? 'ok' : phase === 'loading' ? 'warn' : 'off'}`}/>{t('MargAI')}
        <span className={`drv-dot ${models.mp ? 'ok' : models.mpErr ? 'bad' : phase === 'loading' ? 'warn' : 'off'}`}/>{t('MediaPipe')}
        <span className="drv-sep"/>
        {phase === 'running' ? <>{stats.fps} {t('fps')}</> : <>{t('idle')}</>}
      </div>
      <div className="drv-pillrow small"><b className={source === 'recorded_replay' ? 'drv-replay' : source === 'live' ? 'drv-live' : ''}>{modeLabel}</b>
        {phase === 'running' && <> · {yolo.current.version === 'margai-yolo11n-fp32' ? 'MargAI YOLO11n fp32' : 'MargAI YOLO11n int8'} {stats.yoloMs} ms · {MP_LABEL} {stats.mpMs} ms</>}
        {stats.saver && <> · <span className="drv-saver">{t('Power saver')}</span></>}
        {fog?.foggy && <> · <span className="drv-saver">{t('Low visibility (estimate)')}</span></>}</div>
      {models.mpErr && <div className="drv-pillrow small">{t('MediaPipe could not load (offline?) — animal/person detection from COCO is off')}</div>}
    </header>
    {level && <div className={`drv-alert ${level}`} role="alert" aria-live="assertive">
      <div className="drv-alert-lv">{level === 'urgent' ? t('WARNING') : level === 'caution' ? t('CAUTION') : t('INFO')}{dist != null && !(local && local.until > now) ? ` · ${Math.round(dist)} m` : ''}</div>
      <div className="drv-alert-tx">{cardText}</div>
    </div>}
    {accident && <div className="drv-accident" role="alertdialog" aria-live="assertive">
      <h2>{t('Possible crash detected')}</h2><p>{t('Impact {g} g with a sudden stop. Sending an incident report in {s} s.', {g: accident.peakG.toFixed(1), s: accident.left})}</p>
      <div className="drv-count">{accident.left}</div>
      <button className="btn3d mint big" onClick={cancelAccident}>{t("I'm OK / Cancel")}</button>
    </div>}
    {toast && <div className="drv-toast" role="status">{toast}</div>}
    <section className="drv-sheet glass">
      <div className="drv-main">
        <button className={`drv-chip ${carConnected ? 'on' : ''}`} onClick={() => setSheet(true)} aria-label={t('Pair with car display')}>
          <span className="drv-chip-ico">🚗</span><span>{carConnected ? t('Car display connected') : t('Pair with car')}</span>
        </button>
        <button className={`btn3d big ${phase === 'running' ? 'coral' : 'mint'}`} disabled={phase === 'loading'} onClick={() => (phase === 'running' ? stop() : start('live'))}>
          {phase === 'loading' ? loadMsg || t('Loading…') : phase === 'running' ? t('Stop') : t('Start')}
        </button>
        <button className="btn3d round white" onClick={toggleMute} aria-label={isMuted ? t('Unmute') : t('Mute')} aria-pressed={isMuted}>{isMuted ? '🔇' : '🔊'}</button>
      </div>
      <div className="drv-reports" role="group" aria-label={t('Quick report')}>
        {reports.map(r => <button key={r.cls} className="btn3d round white" onClick={() => report(r.cls, r.label)} aria-label={t('Report {what}', {what: r.label})} title={r.label}>{r.emoji}</button>)}
      </div>
      <div className="drv-meta">
        <span>{t('Seen {n}', {n: total('seen')})} · {t('Sent {n}', {n: total('sent')})} · {t('Server confirmed {n}', {n: total('acked')})}</span>
        <span>{!relayUp ? t('Offline — not connected to MargAI') : delivered == null ? (carLink.lastAckAt ? '' : t('No display paired')) : delivered === 0 ? t('No display connected') : t('Delivered to {n} display(s)', {n: delivered})}</span>
        {phase === 'running' && <span>{motionState === 'on' ? t('Impact sensor on') : t('Impact sensor unavailable')}</span>}
      </div>
    </section>
    {sheet && <div className="drv-modal" onClick={() => setSheet(false)}><div className="drv-qr glass" onClick={e => e.stopPropagation()} role="dialog" aria-label={t('Pair with car display')}>
      <h2>{t('Pair with car display')}</h2>
      <p>{t('Open this on the car screen, or scan the QR code:')}</p>
      <div className="drv-code" data-testid="pair-code">{code}</div>
      {qr && <img src={qr} width={200} height={200} alt={t('QR code to open the car display')}/>}
      <p className="drv-link">{`${location.origin}/?view=car&code=${code}`}</p>
      <p><b>{carConnected ? t('Car display connected') : t('Waiting for car display')}</b>{delivered != null && <> · {delivered === 0 ? t('No display connected') : t('Delivered to {n} display(s)', {n: delivered})}</>}</p>
      <button className="btn3d violet" onClick={() => setSheet(false)}>{t('Done')}</button>
    </div></div>}
  </div>;
};
export default DriverApp;
