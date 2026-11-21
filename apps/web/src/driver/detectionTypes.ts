export type DetClass = 'pothole' | 'animal' | 'pedestrian' | 'vehicle';
export type Det = {cls: DetClass; conf: number; x: number; y: number; w: number; h: number; src: 'pothole-yolov8' | 'margai-yolo11n-int8' | 'margai-yolo11n-fp32' | 'mediapipe-efficientdet-lite0'; label?: string; frameTime?: number};

export const YOLO_SIZE = 320;
export const YOLO_VERSION = 'margai-yolo11n-int8';
export const YOLO_FP32_VERSION = 'margai-yolo11n-fp32';
export const MP_VERSION = 'mediapipe-efficientdet-lite0';
const YOLO_CLASSES: DetClass[] = ['pothole', 'animal', 'pedestrian'];
/** Per-class confidence floors. Default 0.35; the custom model's 'animal' head needs more (see report: it fires on real pothole photos). */
const YOLO_MIN_CONF: Record<string, number> = {pothole: 0.35, animal: 0.7, pedestrian: 0.35};

export const iou = (a: {x: number; y: number; w: number; h: number}, b: {x: number; y: number; w: number; h: number}) => {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy; return inter / (a.w * a.h + b.w * b.h - inter || 1);
};
export function nms<T extends Det>(dets: T[], thr = 0.45): T[] {
  const sorted = [...dets].sort((a, b) => b.conf - a.conf); const keep: T[] = [];
  for (const d of sorted) if (!keep.some(k => k.cls === d.cls && iou(k, d) > thr)) keep.push(d);
  return keep;
}

/** Decode an Ultralytics YOLO11 head: data laid out [1, 4+nc, anchors] (channel-major), boxes are cx,cy,w,h in input pixels.
 *  lb maps letterboxed input pixels back to normalised source coordinates. */
export function decodeYolo(data: ArrayLike<number>, nc: number, anchors: number, lb: {scale: number; padX: number; padY: number; srcW: number; srcH: number}, minConf = YOLO_MIN_CONF): Det[] {
  const out: Det[] = [];
  for (let i = 0; i < anchors; i++) {
    let best = 0, bc = 0;
    for (let c = 0; c < nc; c++) { const s = data[(4 + c) * anchors + i]; if (s > best) { best = s; bc = c; } }
    const cls = YOLO_CLASSES[bc]; if (!cls || best < (minConf[cls] ?? 0.35)) continue;
    const cx = data[i], cy = data[anchors + i], w = data[2 * anchors + i], h = data[3 * anchors + i];
    const x0 = (cx - w / 2 - lb.padX) / lb.scale / lb.srcW, y0 = (cy - h / 2 - lb.padY) / lb.scale / lb.srcH;
    const x1 = (cx + w / 2 - lb.padX) / lb.scale / lb.srcW, y1 = (cy + h / 2 - lb.padY) / lb.scale / lb.srcH;
    const x = Math.max(0, x0), y = Math.max(0, y0), ww = Math.min(1, x1) - x, hh = Math.min(1, y1) - y;
    if (ww <= 0.003 || hh <= 0.003) continue;
    out.push({cls, conf: best, x, y, w: ww, h: hh, src: YOLO_VERSION});
  }
  return nms(out, 0.45);
}

/** Fill `dst` (CHW float32 0..1, 3x320x320) from RGBA ImageData of the letterboxed frame. */
export function rgbaToChw(rgba: Uint8ClampedArray | Uint8Array, dst: Float32Array) {
  const n = YOLO_SIZE * YOLO_SIZE;
  for (let i = 0; i < n; i++) { dst[i] = rgba[i * 4] / 255; dst[n + i] = rgba[i * 4 + 1] / 255; dst[2 * n + i] = rgba[i * 4 + 2] / 255; }
}

