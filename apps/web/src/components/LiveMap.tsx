import React, {useCallback, useEffect, useRef, useState} from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import QRCode from 'qrcode';
import {audioSynthesizer, getLocalizedMessage} from '@margai/localization';
import {useI18n} from '../i18n';
import {LiveRelay, scopeFor, type Pose} from '../live/relay';
import {loadDarkStyle, RASTER_FALLBACK} from '../live/mapStyle';
import {ICON, COLOR, LEVEL_COLOR, TYPE_LABEL, SOURCE_LABEL, MESSAGE_KEY, toHazardView, guessType, circlePolygon, angDiff, type HazardView, type RiskLevel} from '../live/hazards';
import '../live.css';

type Mode = 'observer' | 'car';
type Veh = {kind: 'live' | 'simulated'; target: Pose; cur: Pose; marker: maplibregl.Marker; inner: HTMLElement};
type CarAlert = {key: number; type: string; level: RiskLevel; distanceM: number | null; source: string | null; text?: string};
const DEFAULT_CENTER: [number, number] = [77.688, 12.93];
const CAR_SVG = '<svg viewBox="0 0 40 76" width="100%" height="100%"><defs><linearGradient id="cg" x1="0" x2="1"><stop offset="0" stop-color="#cfe0ff"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#b7ccff"/></linearGradient></defs><rect x="4" y="3" width="32" height="70" rx="14" fill="url(#cg)"/><path d="M9 24c0-5 3-8 11-8s11 3 11 8l-2 7H11z" fill="#10204a"/><rect x="10" y="44" width="20" height="14" rx="5" fill="#10204a" opacity=".85"/><rect x="8" y="5" width="7" height="4" rx="2" fill="#2f6bff"/><rect x="25" y="5" width="7" height="4" rx="2" fill="#2f6bff"/><rect x="9" y="68" width="6" height="3" rx="1.5" fill="#ff5d73"/><rect x="25" y="68" width="6" height="3" rx="1.5" fill="#ff5d73"/></svg>';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const validCode = (c: string | null) => { const v = (c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-Z0-9]{4,8}$/.test(v) ? v : ''; };

function hazardEl(h: HazardView) {
  const el = document.createElement('div');
  el.className = 'lm-hz lm-pop' + (h.type.includes('incident') ? ' lm-hot' : '');
  el.style.setProperty('--c', COLOR[h.type] || '#7a4dff');
  el.innerHTML = '<i class="lm-ring"></i><i class="lm-ring r2"></i><b class="lm-shadow"></b><span class="lm-pin">' + (ICON[h.type] || '⚠️') + '</span>';
  return el;
}

export const LiveMap: React.FC<{mode?: Mode; onNavigate?: (tab: any) => void}> = ({mode = 'observer', onNavigate}) => {
  const {t, language} = useI18n();
  const isCar = mode === 'car';
  const mapEl = useRef<HTMLDivElement>(null);
  const [connected, setConnected] = useState(false);
  const [hazards, setHazards] = useState<HazardView[]>([]);
  const [vehicleCount, setVehicleCount] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [fallback, setFallback] = useState(false);
  const [code, setCode] = useState(() => validCode(new URLSearchParams(window.location.search).get('code')));
  const [codeDraft, setCodeDraft] = useState('');
  const [phones, setPhones] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [alert, setAlert] = useState<CarAlert | null>(null);
  const [qr, setQr] = useState('');
  const soundRef = useRef(false); const mutedRef = useRef(false); const langRef = useRef(language);
  soundRef.current = soundOn; mutedRef.current = muted; langRef.current = language;
  const flyRef = useRef<(h: HazardView) => void>(() => {});

  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(i); }, []);
  useEffect(() => { if (!isCar) QRCode.toDataURL(`${window.location.origin}/?view=app`, {margin: 1, width: 160, color: {dark: '#0b0d12', light: '#ffffff'}}).then(setQr).catch(() => {}); }, [isCar]);

  const announce = useCallback((a: Omit<CarAlert, 'key'>) => {
    setAlert({...a, key: Date.now()});
    if (!soundRef.current || mutedRef.current) return;
    try {
      audioSynthesizer.playRiskChime(a.level);
      const msg = getLocalizedMessage(langRef.current, (MESSAGE_KEY[a.type] || 'hazard.incident.ahead_unverified') as any);
      setTimeout(() => { if (!mutedRef.current) audioSynthesizer.speakLocalVoicePhrase(msg.shortVoicePhrase, langRef.current); }, 500);
    } catch { /* audio is best effort */ }
  }, []);
  useEffect(() => { if (!alert) return; const i = setTimeout(() => setAlert(c => c?.key === alert.key ? null : c), 14000); return () => clearTimeout(i); }, [alert]);
  useEffect(() => { if (muted) try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }, [muted]);

  useEffect(() => {
    const host = mapEl.current; if (!host) return;
    let disposed = false; let map: maplibregl.Map | null = null; let raf = 0; let burst: any; let fitTimer: any; let subTimer: any;
    const relay = new LiveRelay();
    const hz = new Map<string, HazardView>(); const hzMarkers = new Map<string, maplibregl.Marker>();
    const veh = new Map<string, Veh>(); const announced = new Set<string>();
    let userMoved = false; let didFit = false; let snapshotAt = 0;
    const self = {have: false, target: {latitude: 0, longitude: 0, headingDeg: 0, speedMps: 0, horizontalAccuracyM: 5} as Pose, cur: {latitude: 0, longitude: 0, headingDeg: 0, speedMps: 0, horizontalAccuracyM: 5} as Pose, zoom: 17, marker: null as maplibregl.Marker | null, inner: null as HTMLElement | null};
    const clientId = 'car_' + Math.random().toString(36).slice(2, 8);

    const pushHazards = () => setHazards([...hz.values()].sort((a, b) => b.lastSeen - a.lastSeen));
    const pop = (h: HazardView) => {
      if (!burst || !map || reducedMotion()) return;
      const p = map.project([h.lon, h.lat]); const r = host.getBoundingClientRect();
      burst.tune({x: p.x + r.left + window.scrollX, y: p.y + r.top + window.scrollY}).replay();
    };
    const updateFog = () => {
      const src: any = map?.getSource('margai-fog'); if (!src) return;
      src.setData({type: 'FeatureCollection', features: [...hz.values()].filter(h => h.type === 'low_visibility').map(h => ({type: 'Feature', properties: {}, geometry: {type: 'Polygon', coordinates: [circlePolygon(h.lat, h.lon, 250)]}}))});
    };
    const fit = () => {
      if (!map || isCar || userMoved) return;
      const pts: [number, number][] = [...hz.values()].map(h => [h.lon, h.lat]);
      veh.forEach(v => pts.push([v.target.longitude, v.target.latitude]));
      if (!pts.length) return;
      const dur = reducedMotion() || !didFit ? 0 : 1200; didFit = true;
      if (pts.length === 1) { map.easeTo({center: pts[0], zoom: 16, duration: dur}); return; }
      const b = new maplibregl.LngLatBounds(pts[0], pts[0]); pts.forEach(p => b.extend(p));
      map.fitBounds(b, {padding: {top: 90, bottom: 90, left: 70, right: window.innerWidth > 800 ? 360 : 70}, maxZoom: 16.5, duration: dur});
    };
    const scheduleFit = () => { clearTimeout(fitTimer); fitTimer = setTimeout(fit, 450); };
    const ensureMarker = (h: HazardView, isNew: boolean, quiet: boolean) => {
      if (!map) return;
      let m = hzMarkers.get(h.id);
      if (m) { m.setLngLat([h.lon, h.lat]); return; }
      const el = hazardEl(h);
      el.addEventListener('click', () => flyRef.current(h));
      m = new maplibregl.Marker({element: el}).setLngLat([h.lon, h.lat]).addTo(map);
      hzMarkers.set(h.id, m);
      if (isNew && !quiet) pop(h);
    };
    const removeMarker = (id: string) => {
      const m = hzMarkers.get(id); if (!m) return; hzMarkers.delete(id);
      const el = m.getElement(); el.classList.add('lm-fade');
      setTimeout(() => m.remove(), reducedMotion() ? 0 : 700);
    };
    const replaceAll = (list: any[], inputMode?: string) => {
      const next = new Set<string>();
      for (const raw of list || []) { const h = toHazardView(raw, inputMode); if (!h) continue; next.add(h.id); const had = hz.has(h.id); hz.set(h.id, h); ensureMarker(h, !had, true); }
      for (const id of [...hz.keys()]) if (!next.has(id)) { hz.delete(id); removeMarker(id); }
      pushHazards(); updateFog();
    };

    const ensureVehicle = (id: string, kind: 'live' | 'simulated', pose: Pose) => {
      if (!map) return;
      let v = veh.get(id);
      if (!v) {
        const el = document.createElement('div'); el.className = 'lm-veh ' + kind;
        el.innerHTML = `<div class="lm-vcar">${CAR_SVG}</div><div class="lm-vlabel"><b>${id}</b><em></em></div>`;
        const marker = new maplibregl.Marker({element: el}).setLngLat([pose.longitude, pose.latitude]).addTo(map);
        v = {kind, target: pose, cur: {...pose}, marker, inner: el.querySelector('.lm-vcar') as HTMLElement};
        veh.set(id, v); setVehicleCount(veh.size);
        if (!userMoved) scheduleFit();
      }
      v.kind = kind; v.target = pose;
      const el = v.marker.getElement(); el.className = 'lm-veh ' + kind;
      (el.querySelector('em') as HTMLElement).textContent = kind === 'live' ? t('LIVE') : t('Simulated');
    };

    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      if (!map) return;
      const dt = Math.min(0.1, (ts - (frame as any).last || 16) / 1000); (frame as any).last = ts;
      const k = reducedMotion() ? 1 : 1 - Math.exp(-dt / 0.35);
      const bearing = map.getBearing();
      veh.forEach(v => {
        v.cur.latitude += (v.target.latitude - v.cur.latitude) * k; v.cur.longitude += (v.target.longitude - v.cur.longitude) * k;
        v.cur.headingDeg = (v.cur.headingDeg + angDiff(v.cur.headingDeg, v.target.headingDeg) * k + 360) % 360;
        v.marker.setLngLat([v.cur.longitude, v.cur.latitude]); v.inner.style.transform = `rotate(${v.cur.headingDeg - bearing}deg)`;
      });
      if (isCar && self.have) {
        const c = self.cur, tg = self.target;
        c.latitude += (tg.latitude - c.latitude) * k; c.longitude += (tg.longitude - c.longitude) * k;
        c.headingDeg = (c.headingDeg + angDiff(c.headingDeg, tg.headingDeg) * k + 360) % 360;
        self.zoom += ((17.2 - Math.min(tg.speedMps / 18, 1) * 1.2) - self.zoom) * k;
        self.marker?.setLngLat([c.longitude, c.latitude]);
        if (self.inner) self.inner.style.transform = `rotate(${c.headingDeg - bearing}deg)`;
        map.jumpTo({center: [c.longitude, c.latitude], bearing: c.headingDeg, pitch: 60, zoom: self.zoom, padding: {top: Math.round(host.clientHeight * 0.38), bottom: 0, left: 0, right: 0}});
      }
    };

    (async () => {
      if (!reducedMotion()) import('@mojs/core').then(m => {
        if (disposed) return; const mojs: any = (m as any).default;
        burst = new mojs.Burst({parent: document.body, top: 0, left: 0, count: 9, radius: {10: 70}, children: {shape: 'circle', radius: {6: 0}, fill: ['#2f6bff', '#7a4dff', '#ff5d73', '#ffc23d', '#18c98a'], duration: 700, easing: 'cubic.out'}, isShowStart: false});
        if (burst.el) { burst.el.style.pointerEvents = 'none'; burst.el.style.zIndex = '2000'; burst.el.setAttribute('aria-hidden', 'true'); }
      }).catch(() => {});
      const res = await loadDarkStyle(); if (disposed) return;
      setFallback(res.fallback);
      map = new maplibregl.Map({container: host, style: res.style, center: DEFAULT_CENTER, zoom: isCar ? 17 : 15.5, pitch: isCar ? 60 : 58, bearing: isCar ? 0 : -12, maxPitch: 75, attributionControl: false, interactive: !isCar, fadeDuration: reducedMotion() ? 0 : 300});
      if (import.meta.env.DEV) (window as any).__lm = map;
      map.addControl(new maplibregl.AttributionControl({compact: true}), 'bottom-right');
      if (!isCar) map.addControl(new maplibregl.NavigationControl({visualizePitch: true, showCompass: true}), 'bottom-left');
      let switched = res.fallback;
      map.on('error', (e: any) => { if (!switched && !map?.isStyleLoaded() && /fetch|Failed|NetworkError|style/i.test(String(e?.error?.message || ''))) { switched = true; setFallback(true); map?.setStyle(RASTER_FALLBACK); } });
      map.on('style.load', () => {
        if (!map) return;
        map.addSource('margai-fog', {type: 'geojson', data: {type: 'FeatureCollection', features: []}});
        map.addLayer({id: 'margai-fog-fill', type: 'fill', source: 'margai-fog', paint: {'fill-color': '#c7d6f2', 'fill-opacity': 0.2}});
        map.addLayer({id: 'margai-fog-line', type: 'line', source: 'margai-fog', paint: {'line-color': '#e3ecff', 'line-opacity': 0.5, 'line-width': 1.5, 'line-dasharray': [2, 2]}});
        updateFog();
      });
      map.on('movestart', (e: any) => { if (e.originalEvent) userMoved = true; });
      flyRef.current = h => { userMoved = true; map?.easeTo({center: [h.lon, h.lat], zoom: Math.max(map.getZoom(), 16), duration: reducedMotion() ? 0 : 900}); };

      if (isCar) {
        const el = document.createElement('div'); el.className = 'lm-me';
        el.innerHTML = `<i class="lm-mepulse"></i><div class="lm-mecar">${CAR_SVG}</div>`;
        self.inner = el.querySelector('.lm-mecar'); self.marker = new maplibregl.Marker({element: el});
      }
      raf = requestAnimationFrame(frame);

      relay.onStatus = ok => { if (!disposed) setConnected(ok); };
      setConnected(relay.connected);
      const alive = (fn: (e: any) => void) => (e: any) => { if (!disposed) fn(e); };
      if (!isCar) {
        relay.whenOpen(() => relay.send('watch.join', {}));
        relay.on('watch.snapshot', alive(e => { snapshotAt = Date.now(); const first = hz.size === 0; replaceAll(e.payload?.hazards, e.inputMode); if (first && hz.size && !userMoved) scheduleFit(); }));
        relay.on('vehicle.update', alive(e => { const p = e.payload; if (p?.vehicleId && p.pose) ensureVehicle(p.vehicleId, p.kind === 'simulated' ? 'simulated' : 'live', p.pose); }));
        relay.on('vehicle.gone', alive(e => { const v = veh.get(e.payload?.vehicleId); if (!v) return; veh.delete(e.payload.vehicleId); setVehicleCount(veh.size); const el = v.marker.getElement(); el.classList.add('lm-fade'); setTimeout(() => v.marker.remove(), 700); }));
      } else if (code) {
        relay.whenOpen(() => relay.send('pair.join', {code, role: 'car'}));
        relay.on('pair.status', alive(e => { const p = e.payload || {}; if (typeof p.phones === 'number') setPhones(p.phones); else if (p.joined === 'phone') setPhones(n => Math.max(1, n)); }));
        relay.on('infotainment.update', alive(e => {
          const p = e.payload || {};
          if (p.kind === 'pose') {
            const s = p.pose || p; if (typeof s.latitude !== 'number' || typeof s.longitude !== 'number') return;
            const pose: Pose = {latitude: s.latitude, longitude: s.longitude, headingDeg: s.headingDeg ?? self.target.headingDeg, speedMps: s.speedMps ?? 0, horizontalAccuracyM: s.horizontalAccuracyM ?? 10};
            self.target = pose; setPhones(n => Math.max(1, n));
            if (!self.have) { self.have = true; self.cur = {...pose}; self.zoom = 17; self.marker?.setLngLat([pose.longitude, pose.latitude]); if (map && self.marker) self.marker.addTo(map); }
          } else if (p.kind === 'alert') {
            const level: RiskLevel = (['information', 'caution', 'urgent'] as const).includes(p.level || p.riskLevel) ? (p.level || p.riskLevel) : 'caution';
            const d = p.distanceM ?? p.distanceAheadM;
            announce({type: guessType(p), level, distanceM: typeof d === 'number' ? Math.round(d) : null, source: 'live_phone', text: typeof p.text === 'string' ? p.text : undefined});
          }
        }));
        const consider = (alerts: any[]) => {
          const order = {urgent: 3, caution: 2, information: 1} as any;
          const fresh = (alerts || []).filter(a => a && !announced.has(a.hazardId + ':' + a.riskLevel)).sort((a, b) => order[b.riskLevel] - order[a.riskLevel])[0];
          if (!fresh) return; announced.add(fresh.hazardId + ':' + fresh.riskLevel);
          const h = hz.get(fresh.hazardId); if (!h) return;
          announce({type: h.type, level: fresh.riskLevel, distanceM: typeof fresh.distanceAheadM === 'number' ? Math.round(fresh.distanceAheadM) : null, source: h.source});
        };
        relay.on('subscription.snapshot', alive(e => { replaceAll(e.payload?.hazards, e.inputMode); consider(e.payload?.alerts); }));
        relay.on('hazard.upsert', alive(e => {
          const h = toHazardView(e.payload?.hazard, e.inputMode); if (!h) return;
          const had = hz.has(h.id); hz.set(h.id, h); ensureMarker(h, !had, false); pushHazards(); updateFog();
          if (e.payload?.personalizedAlert) consider([e.payload.personalizedAlert]);
        }));
        subTimer = setInterval(() => { if (self.have && relay.connected) relay.send('subscription.replace', scopeFor(clientId, self.target)); }, 1000);
      }
      relay.on('hazard.upsert', alive(e => {
        if (isCar) return;
        const h = toHazardView(e.payload?.hazard, e.inputMode); if (!h) return;
        const had = hz.has(h.id); hz.set(h.id, h); ensureMarker(h, !had, false); pushHazards(); updateFog();
        if (!had) scheduleFit();
      }));
      relay.on('hazard.expire', alive(e => { const id = e.payload?.hazardId; if (hz.delete(id)) { removeMarker(id); pushHazards(); updateFog(); } }));
    })();

    return () => {
      disposed = true; cancelAnimationFrame(raf); clearTimeout(fitTimer); clearInterval(subTimer); relay.close();
      burst?.stop?.(); burst?.el?.remove?.();
      try { map?.remove(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, code]);

  const ago = (ts: number) => { const s = Math.max(0, Math.round((now - ts) / 1000)); return s < 60 ? t('{n}s ago', {n: s}) : s < 3600 ? t('{n} min ago', {n: Math.round(s / 60)}) : t('{n} h ago', {n: Math.round(s / 3600)}); };
  const enableSound = () => {
    try { audioSynthesizer.playRiskChime('information'); window.speechSynthesis?.speak(new SpeechSynthesisUtterance('')); } catch { /* ignore */ }
    setSoundOn(true);
  };
  const pill = isCar
    ? (!connected ? t('Offline') : phones > 0 ? t('Live · phone connected') : t('Waiting for phone · {code}', {code}))
    : (connected ? t('Live · relay connected') : t('Offline'));
  const newest = hazards.slice(0, 5);

  return (
    <section className={`lm-root ${isCar ? 'lm-car' : 'lm-observer'}${fallback ? ' lm-fallback' : ''}`} aria-label={t('Live road map')}>
      <div className="lm-map" ref={mapEl}/>
      <div className="lm-vignette" aria-hidden="true"/>
      <div className={`lm-pill ${connected ? 'on' : 'off'}`} role="status"><i/>{pill}</div>

      {!isCar && <>
        <aside className="lm-list" aria-label={t('Recent hazards')}>
          <header><span><b>{hazards.length}</b> {t('hazards')}</span><span><b>{vehicleCount}</b> {t('vehicles')}</span></header>
          {newest.map(h => (
            <button key={h.id} className="lm-item" style={{['--c' as any]: COLOR[h.type] || '#7a4dff'}} onClick={() => flyRef.current(h)}>
              <span className="lm-ico">{ICON[h.type] || '⚠️'}</span>
              <span className="lm-txt"><b>{t(TYPE_LABEL[h.type] || 'Hazard')}</b><small>{ago(h.lastSeen)}</small></span>
              <span className={`lm-src ${h.source}`}>{t(SOURCE_LABEL[h.source])}</span>
            </button>
          ))}
        </aside>
        {hazards.length === 0 && vehicleCount === 0 && (
          <div className="lm-empty">
            <h3>{t('No live events right now')}</h3>
            <p>{t('Open the driver app on your phone and hazards will appear here the moment they are reported.')}</p>
            {qr && <img src={qr} alt={t('QR code to open the driver app')} width={112} height={112}/>}
            <div className="lm-cta">
              <a className="btn3d" href="?view=app">{t('Open the driver app')}</a>
              <button className="btn3d" style={{['--b' as any]: '#fff', ['--bd' as any]: '#c9c3e6', color: 'var(--ink)'}} onClick={() => onNavigate?.('journey')}>{t('Run demo journey')}</button>
            </div>
          </div>
        )}
      </>}

      {isCar && <>
        <button className="lm-mute" onClick={() => setMuted(m => !m)} aria-pressed={muted} aria-label={muted ? t('Unmute') : t('Mute')}>{muted ? '🔇' : '🔊'}</button>
        {!code && (
          <form className="lm-code" onSubmit={e => { e.preventDefault(); const c = validCode(codeDraft); if (c) { const u = new URL(window.location.href); u.searchParams.set('code', c); window.history.replaceState(null, '', u); setCode(c); } }}>
            <h2>{t('Enter the code shown on your phone')}</h2>
            <input value={codeDraft} onChange={e => setCodeDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} maxLength={8} inputMode="text" autoCapitalize="characters" autoFocus aria-label={t('Pairing code')} placeholder="ABCD"/>
            <button className="btn3d" type="submit" disabled={validCode(codeDraft).length < 4}>{t('Connect')}</button>
          </form>
        )}
        {code && !soundOn && (
          <div className="lm-sound"><button className="btn3d" onClick={enableSound}>🔊 {t('Enable sound')}</button><p>{t('Tap once so alerts can be spoken.')}</p></div>
        )}
        {alert && (
          <div key={alert.key} className={`lm-alert ${alert.level}`} role="alert" aria-live="assertive" style={{['--lv' as any]: LEVEL_COLOR[alert.level]}}>
            <div className="lm-bigico">{ICON[alert.type] || '⚠️'}</div>
            <div className="lm-atxt">
              <b>{alert.text && alert.text.length < 40 ? alert.text : t(TYPE_LABEL[alert.type] || 'Hazard')}</b>
              {alert.distanceM != null && <span className="lm-dist">{t('{m} m ahead', {m: alert.distanceM})}</span>}
              {alert.source && <span className={`lm-src ${alert.source}`}>{t((SOURCE_LABEL as any)[alert.source] || 'LIVE phone')}</span>}
            </div>
          </div>
        )}
      </>}
    </section>
  );
};
