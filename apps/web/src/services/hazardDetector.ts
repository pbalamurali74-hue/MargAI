import {PhoneVision} from '../mobile/vision';
/** Real on-device road and COCO object models. Distances are not inferred from a single box. */
export type HazardType = 'PEDESTRIAN' | 'ANIMAL' | 'POTHOLE' | 'WATERLOGGING' | 'VEHICLE';

export interface DetectedHazard {
  hazard_type: HazardType;
  /** Bounding box as percentages [left%, top%, right%, bottom%] */
  bbox: [number, number, number, number];
  confidence: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  distance_m: number|null;
  label: string;
  geo?: { lat: number; lng: number; accuracy: number };
  timestamp: number;
}

export interface DetectionResult {
  hazards: DetectedHazard[];
  fps: number;
  inferenceMs: number;
  frameWidth: number;
  frameHeight: number;
}

// ── GPS Geolocation & Geofencing ───────────────────────────────────

let currentGeoPosition: { lat: number; lng: number; accuracy: number } | null = null;
let geoWatchId: number | null = null;

export function startGeoTracking() {
  if (geoWatchId !== null) return;
  if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
    geoWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        currentGeoPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 10,
        };
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 5000 }
    );
  }
}

export function stopGeoTracking() {
  if (geoWatchId !== null && typeof navigator !== 'undefined') {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
  }
}

export function getCurrentPosition() {
  return currentGeoPosition;
}

// Shared on-device models for direct camera use in the road showcase.
let vision:PhoneVision|null=null;
let previousFrameAt=0;
export async function loadDetectionModel():Promise<boolean>{
  if(!vision)vision=new PhoneVision(()=>{});
  await vision.load();return vision.state.pothole==='ready'||vision.state.objects==='ready';
}
export function getModelStatus(){return {loaded:vision?.state.pothole==='ready'||vision?.state.objects==='ready',loading:vision?.state.pothole==='loading'||vision?.state.objects==='loading',error:[vision?.state.potholeError,vision?.state.objectsError].filter(Boolean).join('; ')||null};}
export async function detectHazards(video:HTMLVideoElement,canvas:HTMLCanvasElement):Promise<DetectionResult>{
  if(!vision||!getModelStatus().loaded)await loadDetectionModel();
  if(video.readyState<2||!video.videoWidth)return {hazards:[],fps:0,inferenceMs:0,frameWidth:0,frameHeight:0};
  canvas.width=Math.min(640,video.videoWidth);canvas.height=Math.round(video.videoHeight*canvas.width/video.videoWidth);canvas.getContext('2d',{willReadFrequently:true})!.drawImage(video,0,0,canvas.width,canvas.height);
  const result=await vision!.detect(canvas);const now=performance.now();const fps=previousFrameAt?1000/(now-previousFrameAt):0;previousFrameAt=now;
  return {hazards:(result?.detections||[]).map(d=>({hazard_type:d.cls.toUpperCase() as HazardType,bbox:[d.x*100,d.y*100,(d.x+d.w)*100,(d.y+d.h)*100],confidence:d.conf,risk_level:'MEDIUM',distance_m:null,label:d.label||d.cls,geo:currentGeoPosition||undefined,timestamp:Date.now()})),fps,inferenceMs:result?.ms||0,frameWidth:video.videoWidth,frameHeight:video.videoHeight};
}
