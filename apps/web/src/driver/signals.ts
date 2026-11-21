/** Real sensor / image signals. Everything here is computed from the device sensors or an actual frame. */
export type FogStat = {dark: number; contrast: number; sat: number; luma: number; foggy: boolean};
/** Visibility estimate (heuristic): dark-channel-prior mean (bright dark channel => haze), low luminance contrast, low saturation, daylight luma. */
export function fogStat(src: CanvasImageSource, cv: HTMLCanvasElement): FogStat {
  const W = 64, H = 36; cv.width = W; cv.height = H; const ctx = cv.getContext('2d', {willReadFrequently: true})!; ctx.drawImage(src, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data; const mn = new Float32Array(W * H); let lsum = 0, l2 = 0, ssum = 0;
  for (let i = 0; i < W * H; i++) {
    const r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255; const lo = Math.min(r, g, b), hi = Math.max(r, g, b);
    mn[i] = lo; const l = 0.299 * r + 0.587 * g + 0.114 * b; lsum += l; l2 += l * l; ssum += hi ? (hi - lo) / hi : 0;
  }
  // 5x5 min filter over the lower 60 % of the frame (road + ahead, skipping sky)
  let dsum = 0, cnt = 0;
  for (let y = Math.floor(H * 0.4); y < H; y++) for (let x = 0; x < W; x++) { let m = 1; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < H && xx >= 0 && xx < W) m = Math.min(m, mn[yy * W + xx]); } dsum += m; cnt++; }
  const n = W * H, luma = lsum / n, contrast = Math.sqrt(Math.max(0, l2 / n - luma * luma)), sat = ssum / n, dark = dsum / cnt;
  return {dark, contrast, sat, luma, foggy: dark > 0.5 && contrast < 0.13 && sat < 0.22 && luma > 0.4};
}

export const G = 9.80665;
export type MotionEvt = {peakG: number; tMs: number};
/** Accelerometer jolt monitor: magnitude of accelerationIncludingGravity in g (rest ~1 g). */
export class MotionSensor {
  active = false; supported = typeof window !== 'undefined' && 'DeviceMotionEvent' in window; lastPeakG = 0; onImpact: (e: MotionEvt) => void = () => {};
  private win: MotionEvt[] = [];
  private h = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity; if (!a || a.x == null || a.y == null || a.z == null) return;
    const g = Math.hypot(a.x, a.y, a.z) / G; const t = performance.now(); this.lastPeakG = g;
    if (g > 2.2) { const last = this.win[this.win.length - 1]; if (!last || t - last.tMs > 400) { this.win.push({peakG: g, tMs: t}); this.onImpact({peakG: g, tMs: t}); } else last.peakG = Math.max(last.peakG, g); }
  };
  async start(): Promise<boolean> {
    if (!this.supported) return false;
    const D: any = (window as any).DeviceMotionEvent;
    if (typeof D.requestPermission === 'function') { try { if ((await D.requestPermission()) !== 'granted') return false; } catch { return false; } }
    window.addEventListener('devicemotion', this.h); this.active = true; return true;
  }
  stop() { window.removeEventListener('devicemotion', this.h); this.active = false; }
  /** Largest jolt within the last `ms`. */
  peakWithin(ms: number) { const t = performance.now(); return this.win.filter(w => t - w.tMs <= ms).reduce((m, w) => Math.max(m, w.peakG), 0); }
}

/** Distance ahead (m) of an object whose bottom edge is at normalised frame y, assuming camera ~1.3 m high, horizon ~45 % down, ~53 deg vertical FOV. Estimate only. */
export function distanceAheadM(bottomY: number) { const dy = bottomY - 0.46; return dy <= 0.03 ? 60 : Math.min(60, Math.max(4, 1.3 / dy)); }
export function projectAhead(lat: number, lon: number, headingDeg: number, ahead: number, lateral: number): [number, number] {
  const h = headingDeg * Math.PI / 180, dN = Math.cos(h) * ahead - Math.sin(h) * lateral, dE = Math.sin(h) * ahead + Math.cos(h) * lateral;
  return [lat + dN / 111320, lon + dE / (111320 * Math.cos(lat * Math.PI / 180))];
}
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makePairCode = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), v => CODE_CHARS[v % CODE_CHARS.length]).join('');
export function deviceId() {
  try { let v = localStorage.getItem('margai-device-id'); if (!v) { v = 'dev_' + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('margai-device-id', v); } return v; } catch { return 'dev_' + Math.random().toString(36).slice(2, 12); }
}
