import {Det, DetClass, iou} from './detectionTypes';
export type Track = {id: string; cls: DetClass; box: Det; conf: number; hits: number; misses: number; firstMs: number; lastMs: number; hist: {t: number; h: number}[]; sentAt: number; confirmed: boolean; ttcS: number | null; src: string};
let seq = 0;
/** Simple greedy IOU tracker. A track is "confirmed" after >=3 matched frames. */
export class Tracker {
  tracks: Track[] = [];
  update(dets: Det[], tMs: number): Track[] {
    const used = new Set<number>();
    for (const tr of this.tracks) {
      let bi = -1, bv = 0.25;
      dets.forEach((d, i) => { if (used.has(i) || d.cls !== tr.cls) return; const v = iou(tr.box, d); if (v > bv) { bv = v; bi = i; } });
      if (bi >= 0) { used.add(bi); const d = dets[bi]; const previousFrame=tr.box.frameTime; tr.box = d; tr.conf = Math.max(d.conf, tr.conf * 0.9); if(d.frameTime===undefined||d.frameTime!==previousFrame)tr.hits++; tr.misses = 0; tr.lastMs = tMs; tr.src = d.src; tr.hist.push({t: tMs, h: d.h}); if (tr.hist.length > 12) tr.hist.shift(); if (tr.hits >= 3) tr.confirmed = true; }
      else tr.misses++;
    }
    dets.forEach((d, i) => { if (!used.has(i)) this.tracks.push({id: `t${++seq}`, cls: d.cls, box: d, conf: d.conf, hits: 1, misses: 0, firstMs: tMs, lastMs: tMs, hist: [{t: tMs, h: d.h}], sentAt: 0, confirmed: false, ttcS: null, src: d.src}); });
    this.tracks = this.tracks.filter(t => t.misses <= 4);
    for (const t of this.tracks) t.ttcS = ttcOf(t);
    return this.tracks;
  }
  reset() { this.tracks = []; }
}
/** Time-to-collision ESTIMATE from relative box-height growth (tau = h / (dh/dt), least-squares slope over the last ~1.2 s).
 *  Only for boxes in the lower-centre corridor of the frame; null when not approaching. */
export function ttcOf(t: Track): number | null {
  if (t.cls === 'pothole' || t.hits < 4 || t.misses > 0) return null;
  const b = t.box, cx = b.x + b.w / 2, bottom = b.y + b.h;
  if (cx < 0.25 || cx > 0.75 || bottom < 0.6 || b.h < 0.1) return null;
  const pts = t.hist.filter(p => t.lastMs - p.t <= 1200); if (pts.length < 4 || pts[pts.length - 1].t - pts[0].t < 500) return null;
  const n = pts.length, mt = pts.reduce((s, p) => s + p.t, 0) / n, mh = pts.reduce((s, p) => s + p.h, 0) / n;
  let num = 0, den = 0; for (const p of pts) { num += (p.t - mt) * (p.h - mh); den += (p.t - mt) ** 2; }
  const slope = num / (den || 1) * 1000; // box-height units per second
  if (slope <= 0.03 || slope / mh < 0.15) return null; // must be growing >=15 %/s
  return Math.max(0, mh / slope);
}
