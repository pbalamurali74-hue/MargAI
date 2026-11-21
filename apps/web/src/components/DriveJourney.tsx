import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AlertTriangle, CheckCircle2, Eye, FileText, LocateFixed, Pause, Play, RotateCcw, Share2, Bell, Volume2, VolumeX, WifiOff} from 'lucide-react';
import {audioSynthesizer, getLocalizedMessage, type MessageKey} from '@margai/localization';
import type {DriverAlert, Hazard} from '@margai/contracts';
import {useI18n} from '../i18n';
import {serviceUrl} from '../services/apiClient';
import {CUM, offset, pointAt, snapToCorridor, ROUTE} from '../drive/geo';
import {createMap, usingGoogle, type CarKind, type MapAdapter} from '../drive/mapAdapter';
import {VirtualCar, type CarPose} from '../drive/virtualCar';
import '../journey.css';

const SCALE = 3;                       // demo speed-up (labelled in the UI)
const HAZ_S = CUM[1] + 330;            // pothole position along the corridor
const HAZ_AT = pointAt(HAZ_S).pos;
const END_S = CUM[2] + 120;            // journey end, past the earlier-reported cattle hazard
const START: Record<CarKind, number> = {lead: 650, you: 450, svc: 520, opp: END_S + 60};
const SPEED: Record<CarKind, number> = {lead: 14.5, you: 15.5, svc: 11, opp: 15};
const LANG_VOICE: Record<string, string> = {en: 'en', hi: 'hi', ta: 'ta', te: 'te', kn: 'kn', mr: 'mr', bn: 'bn'};
const EMOJI: Record<string, string> = {pothole: '🕳️', animal: '🐄', pedestrian: '🚶', low_visibility: '🌫️'};
const STEPS = [{k: 'See', i: Eye}, {k: 'Share', i: Share2}, {k: 'Warn', i: Bell}, {k: 'Clear', i: CheckCircle2}, {k: 'Report', i: FileText}] as const;
const RANK = ['information', 'caution', 'urgent'];

interface Ui {
  phase: 'idle' | 'running' | 'paused' | 'done';
  step: number;
  alert: {level: string; key: MessageKey; distance: number} | null;
  cleared: boolean;
  shareMs: number | null; reachMs: number | null;
  relay: boolean;
  warned: {opp: boolean; svc: boolean; you: boolean};
  caseInfo: {id: string; status: string; authority: string} | null;
  evidence: {sightings: number; sources: number} | null;
  live: 'off' | 'searching' | 'on' | 'outside';
}
const initUi: Ui = {phase: 'idle', step: 0, alert: null, cleared: false, shareMs: null, reachMs: null, relay: false, warned: {opp: false, svc: false, you: false}, caseInfo: null, evidence: null, live: 'off'};

function keyFor(a: DriverAlert, type: string): MessageKey {
  if (type === 'animal') return 'hazard.animal.ahead_caution';
  if (type === 'pedestrian') return 'hazard.pedestrian.ahead_caution';
  if (a.riskLevel === 'caution' && type === 'pothole') return 'hazard.pothole.ahead_caution';
  return a.messageKey as MessageKey;
}
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const DriveJourney: React.FC<{onNavigate?: (tab: 'civic') => void}> = ({onNavigate}) => {
  const {t, language} = useI18n();
  const langRef = useRef(language); langRef.current = language;
  const hostRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const mapRef = useRef<MapAdapter | null>(null);
  const carsRef = useRef<Record<CarKind, VirtualCar> | null>(null);
  const [ui, setUi] = useState<Ui>(initUi);
  const [muted, setMuted] = useState(false); const mutedRef = useRef(false); mutedRef.current = muted;
  const [mapReady, setMapReady] = useState(false);
  const S = useRef({s: {...START}, last: 0, raf: 0, phase: 'idle' as Ui['phase'], detected: false, leadHazard: '', submitAt: 0,
    armed: new Set<string>(), passed: new Set<string>(), lastLevel: '', lastAlertId: '', ui: {...initUi} as Ui, pushAt: 0, gpsS: null as number | null, gpsSpeed: 0, watch: -1});
  const burst = useRef<any>(null);
  const finishRef = useRef<() => void>(() => {});

  const push = useCallback((patch: Partial<Ui>, force = false) => {
    const st = S.current; st.ui = {...st.ui, ...patch};
    const now = performance.now();
    if (force || now - st.pushAt > 110) { st.pushAt = now; setUi(st.ui); }
  }, []);

  // ---- map + four vehicles, each with its own relay connection (mount once)
  useEffect(() => {
    let dead = false; let adapter: MapAdapter | null = null;
    const cars: Record<CarKind, VirtualCar> = {lead: new VirtualCar('veh_lead_KA03'), you: new VirtualCar('veh_you_KA05'), opp: new VirtualCar('veh_opposite_KA01'), svc: new VirtualCar('veh_service_KA09', true)};
    carsRef.current = cars;
    cars.lead.onAck = info => { S.current.leadHazard = info.hazardId; push({shareMs: info.ms, step: Math.max(S.current.ui.step, 2)}, true); };
    cars.you.onUpsert = (id, at) => { if (id === S.current.leadHazard && S.current.submitAt && S.current.ui.reachMs === null) push({reachMs: at - S.current.submitAt}, true); };
    const conn = () => push({relay: cars.lead.state.connected && cars.you.state.connected}, true);
    cars.lead.onChange = conn; cars.you.onChange = conn;
    const ready = (a: MapAdapter) => {
      adapter = a; mapRef.current = a; a.setRoute(ROUTE);
      const seed = (k: CarKind, s: number, rev = false, lat = 0) => { const p = pointAt(s); const h = rev ? (p.heading + 180) % 360 : p.heading; a.setCar(k, offset(p.pos, h, lat), h); };
      seed('lead', START.lead); seed('you', START.you); seed('svc', START.svc, false, -32); seed('opp', START.opp, true, 8);
      a.follow(pointAt(START.you).pos); setMapReady(true);
    };
    const made = createMap(hostRef.current!, pointAt(START.you).pos);
    if (made instanceof Promise) made.then(a => { if (dead) a.destroy(); else ready(a); }); else ready(made);
    import('@mojs/core').then(m => {
      if (reduced() || dead) return;
      const mojs = m.default;
      burst.current = new mojs.Burst({parent: document.body, top: 0, left: 0, count: 8, radius: {8: 46}, children: {shape: 'circle', radius: {5: 0}, fill: ['#ff5d73', '#ffc23d', '#7a4dff', '#2f6bff'], duration: 700, easing: 'cubic.out'}, isShowStart: false});
      if (burst.current.el) { burst.current.el.style.pointerEvents = 'none'; burst.current.el.style.zIndex = '600'; }
    }).catch(() => {});
    const st = S.current;
    return () => { dead = true; cancelAnimationFrame(st.raf); Object.values(cars).forEach(c => c.close()); adapter?.destroy(); mapRef.current = null; carsRef.current = null; burst.current?.el?.remove?.(); if (st.watch >= 0) navigator.geolocation.clearWatch(st.watch); };
  }, [push]);

  const speak = useCallback((level: string, key: MessageKey) => {
    if (mutedRef.current) return;
    try {
      audioSynthesizer.playRiskChime(level as never);
      const msg = getLocalizedMessage(langRef.current, key);
      setTimeout(() => audioSynthesizer.speakLocalVoicePhrase(msg.shortVoicePhrase, LANG_VOICE[langRef.current] || 'en'), 450);
    } catch { /* audio is optional */ }
    if (level === 'urgent') navigator.vibrate?.([220, 90, 220]);
  }, []);

  const celebrate = useCallback(() => {
    const r = iconRef.current?.getBoundingClientRect(); if (!r || !burst.current) return;
    burst.current.tune({x: r.left + r.width / 2 + window.scrollX, y: r.top + r.height / 2 + window.scrollY}).replay();
  }, []);

  // ---- simulation loop
  const frame = useCallback((now: number) => {
    const st = S.current; const cars = carsRef.current; const map = mapRef.current; if (!cars || !map) return;
    const dt = Math.min((now - st.last) / 1000, 0.1); st.last = now;
    const running = st.phase === 'running';
    if (running) {
      st.s.lead += SPEED.lead * dt * SCALE; st.s.svc += SPEED.svc * dt * SCALE; st.s.opp -= SPEED.opp * dt * SCALE;
      if (st.gpsS === null) st.s.you += SPEED.you * dt * SCALE;
    }
    if (st.gpsS !== null) st.s.you = st.gpsS;
    const mk = (k: CarKind): CarPose => {
      const p = pointAt(st.s[k]); const h = k === 'opp' ? (p.heading + 180) % 360 : p.heading;
      const lat = k === 'svc' ? -32 : k === 'opp' ? 8 : 0;
      return {pos: offset(p.pos, h, lat), headingDeg: h, speedMps: k === 'you' && st.gpsS !== null ? st.gpsSpeed : SPEED[k]};
    };
    const poses: Record<CarKind, CarPose> = {lead: mk('lead'), you: mk('you'), svc: mk('svc'), opp: mk('opp')};
    (Object.keys(poses) as CarKind[]).forEach(k => { map.setCar(k, poses[k].pos, poses[k].headingDeg); cars[k].update(poses[k]); });
    if (running || st.gpsS !== null) map.follow(poses.you.pos);

    // 1. the lead car "sees" the pothole (simulated perception) and shares it, then confirms with a second frame
    if (running && !st.detected && HAZ_S - st.s.lead <= 35) {
      st.detected = true; st.submitAt = Date.now(); map.ping(HAZ_AT);
      if (cars.lead.submitPothole(poses.lead, HAZ_AT)) setTimeout(() => { if (S.current.phase !== 'idle') cars.lead.submitPothole(mk('lead'), HAZ_AT); }, 1400);
      push({step: Math.max(st.ui.step, 1)}, true);
    }

    // 2. hazards + personalised alerts known to the "You" car (the relay decides relevance)
    const you = cars.you.state;
    you.hazards.forEach((h: Hazard) => map.setHazard(h.id, [h.location.latitude, h.location.longitude], EMOJI[h.type] || '⚠️', st.passed.has(h.id) ? 'passed' : 'new'));
    const live = you.alerts.filter(a => a.relevanceResult && (a.distanceAheadM ?? 0) >= -8).sort((a, b) => (a.distanceAheadM ?? 1e9) - (b.distanceAheadM ?? 1e9));
    const nearest = live[0];
    live.forEach(a => { if ((a.distanceAheadM ?? 1e9) <= 150) st.armed.add(a.hazardId); });
    let cleared = st.ui.cleared;
    st.armed.forEach(id => {
      if (st.passed.has(id) || live.some(a => a.hazardId === id)) return;
      st.passed.add(id);                         // passed: leaves this driver's queue; the shared report stays
      if (id === st.leadHazard) { cleared = true; speak('information', 'hazard.cleared'); push({cleared: true, step: Math.max(st.ui.step, 4)}, true); }
    });
    if (nearest) {
      const type = you.hazards.find(h => h.id === nearest.hazardId)?.type ?? 'pothole';
      const key = keyFor(nearest, type);
      const escalated = nearest.hazardId !== st.lastAlertId || RANK.indexOf(nearest.riskLevel) > RANK.indexOf(st.lastLevel);
      if (escalated) { st.lastAlertId = nearest.hazardId; speak(nearest.riskLevel, key); if (nearest.riskLevel === 'urgent') celebrate(); }
      st.lastLevel = nearest.riskLevel;
      push({alert: {level: nearest.riskLevel, key, distance: nearest.distanceAheadM ?? 0}, step: nearest.hazardId === st.leadHazard ? Math.max(st.ui.step, 3) : st.ui.step, cleared});
    } else { st.lastLevel = ''; push({alert: null, cleared}); }

    // 3. the other cars: proof that drivers on other carriageways stay quiet
    const relevant = (c: VirtualCar) => c.state.alerts.some(a => a.relevanceResult && (a.distanceAheadM ?? -1) >= 0);
    const warned = {you: live.length > 0 || st.passed.size > 0, opp: relevant(cars.opp), svc: relevant(cars.svc)};
    const w = st.ui.warned; if (warned.opp !== w.opp || warned.svc !== w.svc || warned.you !== w.you) push({warned});

    if (running && st.s.you >= END_S && st.gpsS === null) finishRef.current();
    st.raf = requestAnimationFrame(frame);
  }, [push, speak, celebrate]);

  finishRef.current = async () => {
    const st = S.current; if (st.phase === 'done') return;
    st.phase = 'done'; push({phase: 'done', step: 5}, true);
    mapRef.current?.fit(ROUTE);
    try {
      const cases = await (await fetch(serviceUrl('/v1/cases'))).json();
      const c = cases.find((x: {hazardId: string}) => x.hazardId === st.leadHazard);
      const hz = carsRef.current?.you.state.hazards.find(h => h.id === st.leadHazard);
      push({caseInfo: c ? {id: c.id, status: c.status, authority: c.authority?.name ?? 'BBMP'} : null, evidence: hz ? {sightings: hz.evidenceCount, sources: hz.corroboratingSourcesCount} : null}, true);
    } catch { /* report summary is optional */ }
  };

  useEffect(() => {
    if (!mapReady) return;
    const st = S.current; st.last = performance.now(); st.raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(st.raf);
  }, [mapReady, frame]);

  const start = useCallback(async () => {
    const st = S.current;
    if (st.phase === 'running') { st.phase = 'paused'; push({phase: 'paused'}, true); return; }
    if (st.phase === 'paused') { st.phase = 'running'; push({phase: 'running'}, true); return; }
    st.s = {...START}; st.detected = false; st.leadHazard = ''; st.submitAt = 0; st.armed.clear(); st.passed.clear(); st.lastLevel = ''; st.lastAlertId = '';
    try { await fetch(serviceUrl('/v1/simulation/reset'), {method: 'POST'}); } catch { /* relay may be offline */ }
    try { audioSynthesizer.playRiskChime('information' as never); } catch { /* unlock audio on a user gesture */ }
    push({...initUi, relay: st.ui.relay, live: st.ui.live, phase: 'running'}, true);
    st.phase = 'running';
  }, [push]);

  const toggleLive = useCallback(() => {
    const st = S.current;
    if (st.ui.live !== 'off') { if (st.watch >= 0) navigator.geolocation.clearWatch(st.watch); st.watch = -1; st.gpsS = null; push({live: 'off'}, true); return; }
    if (!('geolocation' in navigator)) { push({live: 'outside'}, true); return; }
    push({live: 'searching'}, true);
    st.watch = navigator.geolocation.watchPosition(pos => {
      const snap = snapToCorridor([pos.coords.latitude, pos.coords.longitude]);
      if (!snap) { st.gpsS = null; push({live: 'outside'}, true); return; }
      st.gpsS = snap.s; st.gpsSpeed = Math.max(pos.coords.speed ?? 0, 0); push({live: 'on'}, true);
    }, () => push({live: 'outside'}, true), {enableHighAccuracy: true, maximumAge: 1000, timeout: 10000});
  }, [push]);

  const level = ui.alert?.level ?? (ui.cleared ? 'clear' : 'idle');
  const msg = ui.alert ? getLocalizedMessage(language, ui.alert.key) : ui.cleared ? getLocalizedMessage(language, 'hazard.cleared') : null;
  const primaryLabel = ui.phase === 'running' ? t('Pause') : ui.phase === 'paused' ? t('Resume') : ui.phase === 'done' ? t('Replay') : t('Start drive');
  const PrimaryIcon = ui.phase === 'running' ? Pause : ui.phase === 'done' ? RotateCcw : Play;
  const liveNote = ui.live === 'searching' ? t('Finding your location…') : ui.live === 'on' ? t('Using your live location') : ui.live === 'outside' ? t('You are outside the demo road (Outer Ring Road, Bengaluru).') : '';
  const seen = ui.step >= 2;

  return <div className={`jr level-${level}`}>
    <div className="jr-map" ref={hostRef} aria-label={t('Live road map')}/>
    {!mapReady && <div className="jr-loading" role="status">{t('Loading map…')}</div>}
    <div className="jr-top">
      <span className="jr-pill"><i className="dot"/>{t('Simulated journey')} · ×{SCALE}</span>
      <span className="jr-pill soft">{usingGoogle() ? 'Google Maps' : 'OpenStreetMap'}</span>
    </div>
    {!ui.relay && <div className="jr-banner" role="alert"><WifiOff size={16}/>{t('Relay offline. Run the API to receive warnings.')}</div>}
    <section className="jr-sheet" aria-live="polite">
      <ol className="jr-steps" aria-label={t('Journey steps')}>{STEPS.map((s, i) => <li key={s.k} className={ui.step > i ? 'on' : ''} aria-current={ui.step === i + 1 ? 'step' : undefined}><span className="ic"><s.i size={16}/></span><em>{t(s.k)}</em></li>)}</ol>
      <div className={`jr-msg lv-${level}`}>
        <span className="jr-sym" ref={iconRef}>{level === 'clear' ? <CheckCircle2 size={30}/> : ui.alert ? <AlertTriangle size={30}/> : <Eye size={30}/>}</span>
        <div className="jr-txt">
          <strong>{msg ? msg.shortVoicePhrase : ui.phase === 'idle' ? t('Watch a lead car warn the car behind it.') : t('Listening for road alerts…')}</strong>
          <small>{ui.alert ? `${ui.alert.distance} m` : ui.cleared ? t('Cleared for you. The road report stays open.') : ui.shareMs !== null ? t('Shared in {ms} ms', {ms: ui.shareMs}) : t('Phone sees. Cloud shares. Next driver hears.')}</small>
        </div>
      </div>
      <ul className="jr-cars" aria-label={t('Vehicles')}>
        <li className="c-lead"><i/>{t('Lead car')}<b>{ui.step >= 1 ? t('saw it') : '·'}</b></li>
        <li className="c-you"><i/>{t('You')}<b className={ui.warned.you ? 'yes' : ''}>{ui.warned.you ? t('warned') : '·'}</b></li>
        <li className="c-opp"><i/>{t('Opposite road')}<b className={seen ? 'no' : ''}>{seen ? t('not warned') : '·'}</b></li>
        <li className="c-svc"><i/>{t('Service road')}<b className={seen ? 'no' : ''}>{seen ? t('not warned') : '·'}</b></li>
      </ul>
      {ui.phase === 'done' && <div className="jr-done">
        <span>{ui.caseInfo ? t('Report created for {authority}', {authority: ui.caseInfo.authority}) : t('Report created')}{ui.evidence ? ` · ${ui.evidence.sightings} ${t('sightings')} · ${ui.evidence.sources} ${t('source')}` : ''}</span>
        {onNavigate && <button className="btn3d mint" onClick={() => onNavigate('civic')}><FileText size={17}/>{t('View report')}</button>}
      </div>}
      {liveNote && <p className="jr-note">{liveNote}</p>}
      <div className="jr-actions">
        <button className="btn3d big" onClick={start} disabled={!ui.relay && ui.phase === 'idle'}><PrimaryIcon size={20}/>{primaryLabel}</button>
        <button className={`btn3d round white ${ui.live === 'on' ? 'active' : ''}`} onClick={toggleLive} aria-pressed={ui.live === 'on'} aria-label={t('Use my location')}><LocateFixed size={22}/></button>
        <button className="btn3d round white" onClick={() => setMuted(m => !m)} aria-pressed={muted} aria-label={t(muted ? 'Unmute' : 'Mute')}>{muted ? <VolumeX size={22}/> : <Volume2 size={22}/>}</button>
      </div>
    </section>
  </div>;
};
