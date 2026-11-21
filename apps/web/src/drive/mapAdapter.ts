import {loadGoogleMaps} from '../services/googleMaps';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type {LL} from './geo';

export type CarKind = 'lead' | 'you' | 'opp' | 'svc';
export interface MapAdapter {
  setRoute(path: LL[]): void;
  setCar(kind: CarKind, pos: LL, heading: number): void;
  setHazard(id: string, pos: LL, emoji: string, state: 'new' | 'live' | 'passed'): void;
  ping(pos: LL): void;
  follow(pos: LL): void;
  fit(path: LL[]): void;
  destroy(): void;
}
const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const TILE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const COLORS: Record<CarKind, string> = {lead: '#2f6bff', you: '#7a4dff', opp: '#8a8aa8', svc: '#8a8aa8'};
const LABEL: Record<CarKind, string> = {lead: 'KA-03', you: 'You', opp: 'KA-01', svc: 'KA-09'};
const carHtml = (k: CarKind) => `<div class="mc mc-${k}"><span class="mc-tag">${LABEL[k]}</span><div class="mc-in"><svg width="34" height="34" viewBox="0 0 24 24"><rect x="6.5" y="2.5" width="11" height="19" rx="4" fill="${COLORS[k]}" stroke="#fff" stroke-width="1.6"/><rect x="8.3" y="5.2" width="7.4" height="3.6" rx="1.2" fill="#fff" opacity=".85"/><rect x="8.3" y="15" width="7.4" height="2.4" rx="1" fill="#fff" opacity=".55"/></svg></div></div>`;
const hzHtml = (e: string) => `<div class="hz-m"><div class="hz-ring"></div><div class="hz-ring r2"></div><div class="hz-pin">${e}</div></div>`;
const pingHtml = '<div class="ping-m"><i></i><i></i></div>';
function applyHz(el: HTMLElement | null, st: string) {
  const h = (el?.querySelector('.hz-m') ?? el) as HTMLElement | null; if (!h) return;
  h.classList.add('show'); h.classList.toggle('passed', st === 'passed');
}
function rot(el: HTMLElement | null, deg: number) { const i = el?.querySelector('.mc-in') as HTMLElement | null; if (i) i.style.transform = `rotate(${deg}deg)`; }

function leafletAdapter(host: HTMLElement, center: LL): MapAdapter {
  const map = L.map(host, {zoomControl: false, attributionControl: true, scrollWheelZoom: true, tap: true} as L.MapOptions).setView(center, 16);
  L.tileLayer(TILE, {maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'}).addTo(map);
  const cars = new Map<CarKind, L.Marker>(); const hz = new Map<string, L.Marker>();
  return {
    setRoute(path) {
      L.polyline(path, {color: '#7a4dff', weight: 14, opacity: .22}).addTo(map);
      L.polyline(path, {color: '#2f6bff', weight: 6, opacity: .95}).addTo(map);
      L.polyline(path, {color: '#fff', weight: 2.5, opacity: .9, dashArray: '2 10', className: 'route-flow'}).addTo(map);
    },
    setCar(kind, pos, heading) {
      let m = cars.get(kind);
      if (!m) { m = L.marker(pos, {icon: L.divIcon({className: '', html: carHtml(kind), iconSize: [0, 0]}), zIndexOffset: kind === 'you' ? 1200 : 1000, interactive: false}).addTo(map); cars.set(kind, m); }
      m.setLatLng(pos); rot(m.getElement() ?? null, heading);
    },
    setHazard(id, pos, emoji, st) {
      let m = hz.get(id);
      if (!m) { m = L.marker(pos, {icon: L.divIcon({className: '', html: hzHtml(emoji), iconSize: [0, 0]}), interactive: false}).addTo(map); hz.set(id, m); }
      applyHz(m.getElement() ?? null, st);
    },
    ping(pos) {
      const m = L.marker(pos, {icon: L.divIcon({className: '', html: pingHtml, iconSize: [0, 0]}), interactive: false}).addTo(map);
      setTimeout(() => m.remove(), 1600);
    },
    follow(pos) { map.panTo(pos, {animate: false}); },
    fit(path) { map.fitBounds(L.latLngBounds(path), {padding: [50, 50]}); },
    destroy() { map.remove(); },
  };
}

async function googleAdapter(host: HTMLElement, key: string, center: LL): Promise<MapAdapter> {
  const gm = await loadGoogleMaps(key);
  const map = new gm.Map(host, {center: {lat: center[0], lng: center[1]}, zoom: 17, disableDefaultUI: true, gestureHandling: 'greedy',
    styles: [{featureType: 'poi', stylers: [{visibility: 'off'}]}, {featureType: 'water', stylers: [{color: '#bfe6ff'}]}, {featureType: 'landscape', stylers: [{color: '#fff6e8'}]}]});
  class Ov extends gm.OverlayView {
    el = document.createElement('div'); ll: LL;
    constructor(ll: LL, html: string) { super(); this.ll = ll; this.el.style.position = 'absolute'; this.el.innerHTML = html; this.setMap(map); }
    onAdd() { this.getPanes().overlayMouseTarget.appendChild(this.el); }
    draw() { const p = this.getProjection()?.fromLatLngToDivPixel(new gm.LatLng(this.ll[0], this.ll[1])); if (p) { this.el.style.left = p.x + 'px'; this.el.style.top = p.y + 'px'; } }
    onRemove() { this.el.remove(); }
    move(ll: LL) { this.ll = ll; this.draw(); }
  }
  const cars = new Map<CarKind, Ov>(); const hz = new Map<string, Ov>(); const lines: any[] = [];
  return {
    setRoute(path) {
      const p = path.map(([lat, lng]) => ({lat, lng}));
      lines.push(new gm.Polyline({map, path: p, strokeColor: '#7a4dff', strokeOpacity: .22, strokeWeight: 16}));
      lines.push(new gm.Polyline({map, path: p, strokeColor: '#2f6bff', strokeOpacity: .95, strokeWeight: 6}));
    },
    setCar(kind, pos, heading) { let o = cars.get(kind); if (!o) { o = new Ov(pos, carHtml(kind)); cars.set(kind, o); } o.move(pos); rot(o.el, heading); },
    setHazard(id, pos, emoji, st) { let o = hz.get(id); if (!o) { o = new Ov(pos, hzHtml(emoji)); hz.set(id, o); } applyHz(o.el, st); },
    ping(pos) { const o = new Ov(pos, pingHtml); setTimeout(() => o.setMap(null), 1600); },
    follow(pos) { map.setCenter({lat: pos[0], lng: pos[1]}); },
    fit(path) { const b = new gm.LatLngBounds(); path.forEach(([a, c]) => b.extend({lat: a, lng: c})); map.fitBounds(b, 50); },
    destroy() { lines.forEach(l => l.setMap(null)); cars.forEach(c => c.setMap(null)); hz.forEach(h => h.setMap(null)); },
  };
}
/** Leaflet builds synchronously (safe under StrictMode); Google Maps loads asynchronously. */
export function createMap(host: HTMLElement, center: LL): MapAdapter | Promise<MapAdapter> {
  if (KEY) return googleAdapter(host, KEY, center).catch(() => leafletAdapter(host, center));
  return leafletAdapter(host, center);
}
export const usingGoogle = () => !!KEY;
