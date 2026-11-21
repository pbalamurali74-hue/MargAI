import {visionAsset} from './assets';
/** On-device detectors: MargAI YOLO11n (onnxruntime-web, WASM) + Google MediaPipe EfficientDet-Lite0. Nothing is synthesised: every Det comes from a model run on a real frame. */
export * from './detectionTypes';
import {type Det, type DetClass, YOLO_SIZE, YOLO_VERSION, YOLO_FP32_VERSION, MP_VERSION, decodeYolo, rgbaToChw, nms} from './detectionTypes';

export class YoloDetector {
  ready = false; ms = 0; version = YOLO_VERSION;
  private sess: any; private ort: any; private ctx!: CanvasRenderingContext2D; private input = new Float32Array(3 * YOLO_SIZE * YOLO_SIZE);
  async load() {
    const ort: any = await import('onnxruntime-web/wasm'); this.ort = ort;
    ort.env.wasm.wasmPaths = visionAsset('ort/'); ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
    const options = {executionProviders: ['wasm'], graphOptimizationLevel: 'all'};
    // The fp32 export is supported by mobile WASM; ConvInteger in the int8 export is not.
    this.sess = await ort.InferenceSession.create(visionAsset('models/margai_detector.onnx'), options);
    this.version = YOLO_FP32_VERSION;
    const cv = document.createElement('canvas'); cv.width = cv.height = YOLO_SIZE; this.ctx = cv.getContext('2d', {willReadFrequently: true})!;
    this.ready = true;
  }
  dispose() { this.ready = false; void this.sess?.release?.(); }
  async detect(src: CanvasImageSource, w: number, h: number): Promise<Det[]> {
    const t0 = performance.now(); const s = Math.min(YOLO_SIZE / w, YOLO_SIZE / h);
    const dw = Math.round(w * s), dh = Math.round(h * s), px = Math.floor((YOLO_SIZE - dw) / 2), py = Math.floor((YOLO_SIZE - dh) / 2);
    this.ctx.fillStyle = 'rgb(114,114,114)'; this.ctx.fillRect(0, 0, YOLO_SIZE, YOLO_SIZE); this.ctx.drawImage(src, px, py, dw, dh);
    rgbaToChw(this.ctx.getImageData(0, 0, YOLO_SIZE, YOLO_SIZE).data, this.input);
    const res = await this.sess.run({images: new this.ort.Tensor('float32', this.input, [1, 3, YOLO_SIZE, YOLO_SIZE])});
    const o = res[this.sess.outputNames[0]]; const [, ch, anchors] = o.dims as number[];
    const dets = decodeYolo(o.data as Float32Array, ch - 4, anchors, {scale: s, padX: px, padY: py, srcW: w, srcH: h}).map(d => ({...d, src: this.version as Det['src']}));
    this.ms = performance.now() - t0; return dets;
  }
}

const COCO_ANIMAL = new Set(['cow', 'horse', 'sheep', 'dog', 'cat', 'bird', 'bear', 'elephant', 'zebra', 'giraffe']);
const COCO_VEHICLE = new Set(['car', 'truck', 'bus', 'motorcycle', 'bicycle']);
export class MediaPipeDetector {
  ready = false; ms = 0; private det: any;
  async load() {
    const {FilesetResolver, ObjectDetector} = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(visionAsset('vision-wasm'));
    const modelAssetPath = visionAsset('models/efficientdet_lite0.tflite');
    const opts = (delegate: 'GPU' | 'CPU') => ({baseOptions: {modelAssetPath, delegate}, scoreThreshold: 0.55, maxResults: 12, runningMode: 'IMAGE' as const});
    try { this.det = await ObjectDetector.createFromOptions(fileset, opts('GPU')); } catch { this.det = await ObjectDetector.createFromOptions(fileset, opts('CPU')); }
    this.ready = true;
  }
  dispose() { this.ready = false; this.det?.close?.(); }
  detect(src: HTMLCanvasElement): Det[] {
    const t0 = performance.now(); const r = this.det.detect(src); const out: Det[] = [];
    for (const d of r.detections ?? []) {
      const c = d.categories?.[0]; const bb = d.boundingBox; if (!c || !bb) continue;
      const name = c.categoryName as string; const cls: DetClass | null = COCO_ANIMAL.has(name) ? 'animal' : name === 'person' ? 'pedestrian' : COCO_VEHICLE.has(name) ? 'vehicle' : null;
      if (!cls) continue;
      const x = Math.max(0, bb.originX / src.width), y = Math.max(0, bb.originY / src.height);
      out.push({cls, conf: c.score, x, y, w: Math.min(1, (bb.originX + bb.width) / src.width) - x, h: Math.min(1, (bb.originY + bb.height) / src.height) - y, src: MP_VERSION, label: name});
    }
    this.ms = performance.now() - t0; return out;
  }
}

/** Merge both detectors; same-class overlaps keep the higher-confidence box. */
export const mergeDets = (a: Det[], b: Det[]) => nms([...a, ...b], 0.5);
