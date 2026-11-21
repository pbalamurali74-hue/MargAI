import {PhoneLocationMap} from './PhoneLocationMap';
import React,{useEffect,useRef,useState} from 'react';
import {Camera,CameraOff,Activity,MapPin,Compass,Cpu,RefreshCw,Radio,AlertTriangle,RotateCw} from 'lucide-react';
import {DeviceTelemetry,emptyTelemetry,type Telemetry} from '../mobile/telemetry';
import {PhoneVision,emptyModels,type ModelState} from '../mobile/vision';
import {PhoneBridge,validTarget,type LinkState} from '../mobile/bridge';
import {Tracker,type Track} from '../driver/tracker';
import {deviceId} from '../driver/signals';
import {apiClient} from '../services/apiClient';
import '../mobile.css';
const COLORS={pothole:'#e7b958',pedestrian:'#ef8f73',animal:'#c8db96',vehicle:'#a6cbe5'};
const label=(track:Track)=>track.cls==='pedestrian'?'Pedestrian':track.cls==='pothole'?'Pothole':track.cls==='animal'?(track.box.label||'Animal'):(track.box.label||'Vehicle');
const fmt=(n:number|null|undefined,digits=1)=>n==null?'—':n.toFixed(digits);
const stateLabel=(state:string)=>({off:'Not started',requesting:'Requesting permission',waiting:'Waiting for readings',active:'Receiving readings',denied:'Permission denied',unavailable:'Unavailable',error:'Needs attention',loading:'Loading model',ready:'Model ready'}[state]||state);
export const SmartphoneDashcam:React.FC=()=>{
  const [phase,setPhase]=useState<'off'|'starting'|'running'>('off');const [error,setError]=useState('');
  const [models,setModels]=useState<ModelState>(emptyModels);const [telemetry,setTelemetry]=useState<Telemetry>(emptyTelemetry);
  const [tracks,setTracks]=useState<Track[]>([]);const [inference,setInference]=useState({ms:0,fps:0,frames:0});
  const [target,setTarget]=useState(()=>new URLSearchParams(location.search).get('pair')||'');
  const [link,setLink]=useState<LinkState>({state:'off',message:'No car paired'});const [backend,setBackend]=useState(false);
  const [sharing,setSharing]=useState('Observations stay on this phone until location and heading are available.');
  const [facing,setFacing]=useState<'environment'|'user'>('environment');const [now,setNow]=useState(Date.now());
  const video=useRef<HTMLVideoElement>(null);const stream=useRef<MediaStream|null>(null);const frame=useRef<HTMLCanvasElement>(document.createElement('canvas'));const jpeg=useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const mounted=useRef(true);const active=useRef(false);const operation=useRef(0);const sensors=useRef<DeviceTelemetry|null>(null);const vision=useRef<PhoneVision|null>(null);const bridge=useRef<PhoneBridge|null>(null);const tracker=useRef(new Tracker());const source=useRef(deviceId());const sent=useRef<Record<string,number>>({});const sensorRef=useRef(telemetry);sensorRef.current=telemetry;
  if(!sensors.current)sensors.current=new DeviceTelemetry(value=>{sensorRef.current=value;if(mounted.current)setTelemetry(value);});
  if(!vision.current)vision.current=new PhoneVision(value=>{if(mounted.current)setModels(value);});
  if(!bridge.current)bridge.current=new PhoneBridge(value=>{if(mounted.current)setLink(value);});
  useEffect(()=>{mounted.current=true;let alive=true;const timer=setInterval(()=>setNow(Date.now()),1000);
    // A static hosted phone page can use WebRTC without a REST backend.
    if(!location.hostname.endsWith('github.io')||import.meta.env.VITE_API_ORIGIN)void apiClient.getHealth().then(data=>{if(alive)setBackend(data.status==='ok');}).catch(()=>{});
    return()=>{alive=false;mounted.current=false;active.current=false;operation.current++;clearInterval(timer);stream.current?.getTracks().forEach(t=>t.stop());sensors.current?.stop();bridge.current?.close();vision.current?.dispose();};
  },[]);
  useEffect(()=>{if(!validTarget(target))return;bridge.current!.connect(target,backend);bridge.current!.attach(stream.current);return()=>bridge.current!.close();},[backend]);
  const loadModels=async()=>{await vision.current!.load();if(!mounted.current)vision.current!.dispose();};
  const start=async(nextFacing=facing)=>{
    if(phase==='starting')return;
    if(!window.isSecureContext){setError('Camera, GPS and motion need a secure connection. Open this page over HTTPS or localhost.');return;}
    if(!navigator.mediaDevices?.getUserMedia){setError('This browser does not provide camera access. Open the page in Chrome on Android.');return;}
    const id=++operation.current;setPhase('starting');setError('');
    // All permission requests originate in this tap, before any model download.
    void sensors.current!.startMotion();sensors.current!.startGPS();
    active.current=false;stream.current?.getTracks().forEach(track=>track.stop());
    try{
      const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:nextFacing},width:{ideal:640},height:{ideal:480}}});
      if(!mounted.current||id!==operation.current){media.getTracks().forEach(track=>track.stop());return;}
      stream.current=media;video.current!.srcObject=media;await video.current!.play();
      active.current=true;setPhase('running');bridge.current!.attach(media);void loadModels();
    }catch(cause:any){if(id===operation.current&&mounted.current){stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;setPhase('off');setError(cause?.name==='NotAllowedError'?'Camera permission denied. Allow Camera in this site’s permissions, then tap Start camera.':cause?.name==='NotFoundError'?'No camera was found on this device.':`Camera could not start: ${cause?.message||cause}`);}}
  };
  const stop=()=>{operation.current++;active.current=false;stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;bridge.current!.attach(null);sensors.current!.stop();tracker.current.reset();setTracks([]);setPhase('off');if(video.current)video.current.srcObject=null;};
  useEffect(()=>{
    if(phase!=='running')return;let stopped=false;let timer:ReturnType<typeof setTimeout>;let lastTime=performance.now();let count=0;
    const loop=async()=>{
      if(stopped||!active.current)return;
      const v=video.current,cv=frame.current;
      if(v&&v.readyState>=2&&v.videoWidth){
        const w=Math.min(640,v.videoWidth);cv.width=w;cv.height=Math.round(v.videoHeight*w/v.videoWidth);cv.getContext('2d',{willReadFrequently:true})!.drawImage(v,0,0,cv.width,cv.height);
        const result=await vision.current!.detect(cv);
        if(stopped)return;
        if(result){const current=tracker.current.update(result.detections,performance.now()).filter(t=>t.misses===0);setTracks(current.map(t=>({...t})));count++;const time=performance.now();setInference({ms:result.ms,fps:1000/Math.max(1,time-lastTime),frames:count});lastTime=time;
          const data=sensorRef.current;const fresh=data.gpsStatus==='active'&&data.gps&&Date.now()-data.gps.timestamp<15000&&data.gps.accuracy<=50;const heading=data.gps?.heading??(data.headingAt&&Date.now()-data.headingAt<5000?data.heading:null);
          if(!backend)setSharing('Detection and sensors work on this phone. No road API is connected.');
          else if(!fresh||heading==null||data.gps?.speedMps==null)setSharing('Sharing waits for a recent GPS fix (±50 m or better), measured speed and heading.');
          else for(const track of current){if(track.cls==='vehicle'||!track.confirmed||Date.now()-(sent.current[track.cls]||0)<15000)continue;sent.current[track.cls]=Date.now();const gps=data.gps!;const box=track.box;
            void apiClient.postObservation({id:crypto.randomUUID(),sourceId:source.current,captureTime:new Date().toISOString(),vehiclePose:{latitude:gps.latitude,longitude:gps.longitude,horizontalAccuracyM:gps.accuracy,headingDeg:heading,speedMps:gps.speedMps!},estimatedHazardLocation:{latitude:gps.latitude,longitude:gps.longitude,horizontalAccuracyM:gps.accuracy,provenance:'estimated'},perceptionOutput:[{class:track.cls,confidence:track.conf,bbox:{x:box.x,y:box.y,width:box.w,height:box.h},frameTimeMs:result.ms,modelVersion:track.src}],inputMode:'live'}).then(()=>{if(mounted.current)setSharing('Observation shared. Hazard location is estimated at the phone position.');}).catch(()=>{if(mounted.current)setSharing('Observation was not shared. Check the road API connection.');});
          }
        }
      }
      if(!stopped)timer=setTimeout(loop,160);
    };void loop();return()=>{stopped=true;clearTimeout(timer);};
  },[phase,backend]);
  useEffect(()=>{
    if(phase!=='running')return;
    const interval=setInterval(()=>{const v=video.current;if(!v||v.readyState<2||!v.videoWidth)return;const cv=jpeg.current;cv.width=320;cv.height=Math.round(320*v.videoHeight/v.videoWidth);cv.getContext('2d')!.drawImage(v,0,0,cv.width,cv.height);const data=sensorRef.current;
      bridge.current!.send({telemetry:data,camera_b64:cv.toDataURL('image/jpeg',.5),speed_kmh:data.gpsStatus==='active'&&data.gps?.speedMps!=null?data.gps.speedMps*3.6:null,gps:data.gps,gps_status:data.gpsStatus,g_force:data.gForce,z_accel_g:data.gForce,rotation:data.rotation,heading:data.gps?.heading??data.heading,motion_status:data.motionStatus,model_status:vision.current!.state,hazards:tracker.current.tracks.filter(t=>t.misses===0&&t.cls!=='vehicle').map(t=>({hazard_type:t.cls.toUpperCase(),confidence:t.conf,bbox:[t.box.x*100,t.box.y*100,(t.box.x+t.box.w)*100,(t.box.y+t.box.h)*100],label:label(t),risk_level:'MEDIUM',...(data.gps?{geo:{lat:data.gps.latitude,lng:data.gps.longitude,accuracy:data.gps.accuracy}}:{})}))});
    },300);return()=>clearInterval(interval);
  },[phase]);
  const staleGPS=!!telemetry.gps&&(telemetry.gpsStatus!=='active'||now-telemetry.gps.timestamp>15000);const staleMotion=!!telemetry.motionAt&&now-telemetry.motionAt>3000;
  const ready=models.pothole==='ready'||models.objects==='ready';
  return <section className="phone-camera" aria-label="Mobile camera and sensors">
    <header className="phone-heading"><div><span className="eyebrow">ON-DEVICE ROAD VISION</span><h1>Your phone. Real readings.</h1><p>Camera detection, GPS and motion from this device.</p></div><span className={`phone-tag ${phase==='running'?'good':''}`}>{phase==='running'?'Live camera':'Camera off'}</span></header>
    {!window.isSecureContext&&<div className="phone-error" role="alert">This connection is insecure. Open the HTTPS phone link to enable camera, location and motion.</div>}
    {error&&<div className="phone-error" role="alert"><AlertTriangle size={18}/>{error}</div>}
    <div className="phone-layout"><div className="phone-view-column"><div className="phone-view">
      <video ref={video} playsInline muted aria-label="Live phone camera"/>
      {phase==='running'&&tracks.map(track=><div className="phone-detection" key={track.id} style={{left:`${track.box.x*100}%`,top:`${track.box.y*100}%`,width:`${track.box.w*100}%`,height:`${track.box.h*100}%`,borderColor:COLORS[track.cls]}}><span style={{background:COLORS[track.cls]}}>{label(track)} · {Math.round(track.conf*100)}%</span></div>)}
      {phase!=='running'&&<div className="phone-start"><Camera size={36}/><h2>See what the camera sees.</h2><p>Start to request camera, location and motion access. Detection runs on this phone.</p><button className="premium-button" onClick={()=>void start()} disabled={phase==='starting'}>{phase==='starting'?'Starting camera…':'Start camera & sensors'}</button></div>}
      {phase==='running'&&<div className="phone-frame-status" role="status">{ready?tracks.length?`${tracks.length} objects detected`:'No detections in the current frame':'Camera active · detection model not ready'}{inference.frames>0&&` · ${Math.round(inference.ms)} ms objects · ${Math.round(vision.current?.road.ms||0)} ms road worker`}</div>}
    </div><div className="phone-toolbar"><button className="premium-button-secondary" onClick={()=>{const next=facing==='environment'?'user':'environment';setFacing(next);void start(next);}} disabled={phase!=='running'}><RotateCw size={16}/>Switch camera</button><button className="premium-button-secondary" onClick={stop} disabled={phase==='off'}><CameraOff size={16}/>Stop camera & sensors</button></div>
    <section className="phone-models"><h2><Cpu size={17}/>On-device models</h2><div className="phone-model-row"><span><strong>Potholes</strong><small>YOLOv8 · dedicated pothole model</small></span><span className={models.pothole==='ready'?'good':''}>{stateLabel(models.pothole)}</span></div><div className="phone-model-row"><span><strong>People, animals & vehicles</strong><small>Google EfficientDet-Lite0 · COCO</small></span><span className={models.objects==='ready'?'good':''}>{stateLabel(models.objects)}</span></div>
    {(models.pothole==='error'||models.objects==='error')&&<><p className="phone-error">{models.pothole==='error'?'The pothole model could not run. ':''}{models.objects==='error'?'The object model could not run. ':''}Camera and sensors remain available.</p><button className="text-button" onClick={()=>void loadModels()}><RefreshCw size={15}/>Retry models</button><details><summary>Model error details</summary><pre>{models.potholeError}\n{models.objectsError}</pre></details></>}
    <p className="phone-note">Boxes are model predictions. Pothole detection needs a clear view of the road. Distance and road safety are not verified from a single image.</p></section>
    <PhoneLocationMap fix={telemetry.gps} heading={telemetry.gps?.heading??telemetry.heading} stale={staleGPS}/>
    <section className="phone-pair"><h2><Radio size={17}/>Car display</h2><label htmlFor="phone-display-id">Display ID</label><div className="phone-pair-input"><input id="phone-display-id" value={target} onChange={e=>setTarget(e.target.value)} placeholder="margai-1234" autoCapitalize="none" autoCorrect="off"/><button className="premium-button" disabled={!validTarget(target)} onClick={()=>{bridge.current!.connect(target,backend);bridge.current!.attach(stream.current);}}>Connect</button></div><p role="status" className={link.state==='error'?'bad':''}>{link.message}{link.transport?` · ${link.transport}`:''}</p></section>
    </div><aside className="phone-sensors" aria-label="Device sensor readings">
      <section><div className="sensor-title"><h2><MapPin size={17}/>GPS / location</h2><span className={telemetry.gpsStatus==='active'&&!staleGPS?'good':''}>{staleGPS?'Reading is stale':stateLabel(telemetry.gpsStatus)}</span></div><dl><dt>Latitude</dt><dd>{fmt(telemetry.gps?.latitude,6)}</dd><dt>Longitude</dt><dd>{fmt(telemetry.gps?.longitude,6)}</dd><dt>Accuracy</dt><dd>{telemetry.gps?`±${fmt(telemetry.gps.accuracy,0)} m`:'—'}</dd><dt>Speed from GPS</dt><dd>{telemetry.gps?.speedMps!=null?`${fmt(telemetry.gps.speedMps*3.6)} km/h`:'Not reported'}</dd><dt>Altitude</dt><dd>{telemetry.gps?.altitude!=null?`${fmt(telemetry.gps.altitude)} m`:'Not reported'}</dd><dt>Last fix</dt><dd>{telemetry.gps?`${Math.max(0,Math.round((now-telemetry.gps.timestamp)/1000))} s ago`:'No fix yet'}</dd></dl>{telemetry.gpsError&&<p className="phone-note bad" role="status">{telemetry.gpsError}</p>}<button className="text-button" onClick={()=>sensors.current!.startGPS()}><RefreshCw size={14}/>Enable / retry location</button></section>
      <section><div className="sensor-title"><h2><Activity size={17}/>Accelerometer</h2><span className={telemetry.motionStatus==='active'&&!staleMotion?'good':''}>{staleMotion?'Reading is stale':stateLabel(telemetry.motionStatus)}</span></div><div className="phone-gforce">{fmt(telemetry.gForce,2)}<small> g</small></div><p className="phone-note">Acceleration magnitude including gravity. At rest, about 1 g.</p><dl><dt>Acceleration X</dt><dd>{fmt(telemetry.acceleration?.x,2)} m/s²</dd><dt>Acceleration Y</dt><dd>{fmt(telemetry.acceleration?.y,2)} m/s²</dd><dt>Acceleration Z</dt><dd>{fmt(telemetry.acceleration?.z,2)} m/s²</dd></dl></section>
      <section><div className="sensor-title"><h2><RotateCw size={17}/>Gyroscope</h2><span className={telemetry.gyroStatus==='active'?'good':''}>{stateLabel(telemetry.gyroStatus)}</span></div><dl><dt>Alpha</dt><dd>{fmt(telemetry.rotation?.alpha,2)} °/s</dd><dt>Beta</dt><dd>{fmt(telemetry.rotation?.beta,2)} °/s</dd><dt>Gamma</dt><dd>{fmt(telemetry.rotation?.gamma,2)} °/s</dd></dl></section>
      <section><div className="sensor-title"><h2><Compass size={17}/>Compass</h2><span className={telemetry.compassStatus==='active'?'good':''}>{stateLabel(telemetry.compassStatus)}</span></div><div className="phone-gforce">{fmt(telemetry.gps?.heading??telemetry.heading,0)}<small>°</small></div><p className="phone-note">A measured GPS heading takes priority. Relative orientation is not treated as north.</p><button className="text-button" onClick={()=>void sensors.current!.startMotion()}><RefreshCw size={14}/>Enable / retry motion</button><p className="phone-note">If unavailable on Android: enable Motion sensors in Chrome’s site settings. Some devices do not expose these sensors to websites.</p></section>
      <p className="phone-note" role="status">{sharing}</p>
    </aside></div>
  </section>;
};
