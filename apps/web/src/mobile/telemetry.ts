export type SensorStatus = 'off' | 'requesting' | 'waiting' | 'active' | 'denied' | 'unavailable' | 'error';
export type XYZ = {x:number; y:number; z:number};
export type GPSFix = {latitude:number; longitude:number; accuracy:number; altitude:number|null; speedMps:number|null; heading:number|null; timestamp:number};
export interface Telemetry {
  gpsStatus:SensorStatus; gps:GPSFix|null; gpsError:string;
  motionStatus:SensorStatus; acceleration:XYZ|null; gravity:XYZ|null; gForce:number|null; motionAt:number|null;
  gyroStatus:SensorStatus; rotation:{alpha:number;beta:number;gamma:number}|null;
  compassStatus:SensorStatus; heading:number|null; orientation:{alpha:number|null;beta:number|null;gamma:number|null}|null; orientationAt:number|null; headingAt:number|null;
}
export const emptyTelemetry = ():Telemetry => ({gpsStatus:'off',gps:null,gpsError:'',motionStatus:'off',acceleration:null,gravity:null,gForce:null,motionAt:null,gyroStatus:'off',rotation:null,compassStatus:'off',heading:null,orientation:null,orientationAt:null,headingAt:null});
const finite = (v:unknown):v is number => typeof v==='number' && Number.isFinite(v);
export function vector(value:DeviceMotionEventAcceleration|null):XYZ|null {return value&&finite(value.x)&&finite(value.y)&&finite(value.z)?{x:value.x,y:value.y,z:value.z}:null;}
export function motionReading(event:Pick<DeviceMotionEvent,'acceleration'|'accelerationIncludingGravity'|'rotationRate'>) {
  const acceleration=vector(event.acceleration), gravity=vector(event.accelerationIncludingGravity), r=event.rotationRate;
  return {acceleration,gravity,gForce:gravity?Math.hypot(gravity.x,gravity.y,gravity.z)/9.80665:null,rotation:r&&finite(r.alpha)&&finite(r.beta)&&finite(r.gamma)?{alpha:r.alpha,beta:r.beta,gamma:r.gamma}:null};
}
export function gpsReading(position:GeolocationPosition):GPSFix {
  const c=position.coords;
  return {latitude:c.latitude,longitude:c.longitude,accuracy:c.accuracy,altitude:finite(c.altitude)?c.altitude:null,speedMps:finite(c.speed)&&c.speed>=0?c.speed:null,heading:finite(c.heading)&&c.heading>=0?c.heading:null,timestamp:position.timestamp};
}
export function compassReading(event:DeviceOrientationEvent & {webkitCompassHeading?:number}):number|null {
  const heading=finite(event.webkitCompassHeading)?event.webkitCompassHeading:event.absolute&&finite(event.alpha)?360-event.alpha:null;
  return heading===null?null:((heading%360)+360)%360;
}
/** A status becomes active only after a real, non-null device reading. */
export class DeviceTelemetry {
  state=emptyTelemetry(); private watch:number|null=null; private generation=0; private gpsGeneration=0; private timers:ReturnType<typeof setTimeout>[]=[];
  constructor(private onUpdate:(state:Telemetry)=>void){}
  private update(patch:Partial<Telemetry>){this.state={...this.state,...patch};this.onUpdate(this.state);}
  private motion=(event:DeviceMotionEvent)=>{const r=motionReading(event);this.update({...r,motionStatus:r.gravity||r.acceleration?'active':this.state.motionStatus,gyroStatus:r.rotation?'active':this.state.gyroStatus,motionAt:r.gravity||r.acceleration||r.rotation?Date.now():this.state.motionAt});};
  private orientation=(event:DeviceOrientationEvent)=>{const heading=compassReading(event);this.update({heading:heading??this.state.heading,headingAt:heading!==null?Date.now():this.state.headingAt,compassStatus:heading!==null?'active':this.state.compassStatus,orientation:{alpha:finite(event.alpha)?event.alpha:null,beta:finite(event.beta)?event.beta:null,gamma:finite(event.gamma)?event.gamma:null},orientationAt:Date.now()});};
  startGPS(){
    if(!window.isSecureContext){this.update({gpsStatus:'unavailable',gpsError:'Location needs HTTPS or localhost.'});return;}
    if(!navigator.geolocation){this.update({gpsStatus:'unavailable',gpsError:'Location is not supported by this browser.'});return;}
    if(this.watch!==null)navigator.geolocation.clearWatch(this.watch);
    const generation=this.generation;const gpsGeneration=++this.gpsGeneration;
    this.update({gpsStatus:'requesting',gpsError:''});
    this.watch=navigator.geolocation.watchPosition(position=>{if(generation!==this.generation||gpsGeneration!==this.gpsGeneration)return;this.update({gps:gpsReading(position),gpsStatus:'active',gpsError:''});},error=>{
      if(generation!==this.generation||gpsGeneration!==this.gpsGeneration)return;
      this.update({gpsStatus:error.code===1?'denied':error.code===3?'waiting':'error',gpsError:error.code===1?'Allow Location in this site’s permissions and enable Android Location.':error.code===3?'Waiting for a GPS fix. Move near a window or outdoors.':'The device could not determine its location.'});
    },{enableHighAccuracy:true,maximumAge:1000,timeout:15000});
  }
  /** Invoke directly from a tap so browsers can show motion/orientation permission prompts. */
  async startMotion(){
    const generation=this.generation;
    if(!window.isSecureContext){this.update({motionStatus:'unavailable',gyroStatus:'unavailable',compassStatus:'unavailable'});return;}
    const motionAPI=(window as any).DeviceMotionEvent, orientationAPI=(window as any).DeviceOrientationEvent;
    this.update({motionStatus:motionAPI?'requesting':'unavailable',gyroStatus:motionAPI?'requesting':'unavailable',compassStatus:orientationAPI?'requesting':'unavailable'});
    const ask=(api:any)=>{try{return api?.requestPermission?api.requestPermission():Promise.resolve(api?'granted':'unavailable');}catch(error){return Promise.reject(error);}};
    // Start both requests before awaiting either; preserve the user gesture.
    const results=await Promise.allSettled([ask(motionAPI),ask(orientationAPI)]);
    if(generation!==this.generation)return;
    if(results[0].status==='fulfilled'&&results[0].value==='granted'){
      window.addEventListener('devicemotion',this.motion);this.update({motionStatus:'waiting',gyroStatus:'waiting'});
    }else this.update({motionStatus:motionAPI?'denied':'unavailable',gyroStatus:motionAPI?'denied':'unavailable'});
    if(results[1].status==='fulfilled'&&results[1].value==='granted'){
      window.addEventListener('deviceorientationabsolute',this.orientation as EventListener);
      window.addEventListener('deviceorientation',this.orientation);this.update({compassStatus:'waiting'});
    }else this.update({compassStatus:orientationAPI?'denied':'unavailable'});
    this.timers.push(setTimeout(()=>{if(generation!==this.generation)return;const patch:Partial<Telemetry>={};for(const key of ['motionStatus','gyroStatus','compassStatus'] as const)if(this.state[key]==='waiting')patch[key]='unavailable';this.update(patch);},8000));
  }
  stop(){
    this.generation++;if(this.watch!==null)navigator.geolocation?.clearWatch(this.watch);this.watch=null;
    window.removeEventListener('devicemotion',this.motion);window.removeEventListener('deviceorientationabsolute',this.orientation as EventListener);window.removeEventListener('deviceorientation',this.orientation);
    this.timers.forEach(clearTimeout);this.timers=[];this.state=emptyTelemetry();this.onUpdate(this.state);
  }
}
