import {emptyTelemetry,type Telemetry,type SensorStatus} from './telemetry';
const number=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const optional=(value:unknown)=>number(value)?value:null;
const status=(value:unknown):SensorStatus=>['off','requesting','waiting','active','denied','unavailable','error'].includes(String(value))?value as SensorStatus:'unavailable';
/** Treat peer packets as external input. Missing values remain unavailable. */
export function readPhoneTelemetry(input:any):Telemetry {
  const t=emptyTelemetry();if(!input||typeof input!=='object')return t;
  for(const key of ['gpsStatus','motionStatus','gyroStatus','compassStatus'] as const)t[key]=status(input[key]);
  const gps=input.gps;
  if(gps&&number(gps.latitude)&&Math.abs(gps.latitude)<=90&&number(gps.longitude)&&Math.abs(gps.longitude)<=180&&number(gps.accuracy)&&gps.accuracy>=0&&number(gps.timestamp))t.gps={latitude:gps.latitude,longitude:gps.longitude,accuracy:gps.accuracy,timestamp:gps.timestamp,altitude:optional(gps.altitude),speedMps:number(gps.speedMps)&&gps.speedMps>=0?gps.speedMps:null,heading:number(gps.heading)&&gps.heading>=0&&gps.heading<360?gps.heading:null};
  for(const key of ['acceleration','gravity'] as const){const v=input[key];if(v&&number(v.x)&&number(v.y)&&number(v.z))t[key]={x:v.x,y:v.y,z:v.z};}
  const r=input.rotation;if(r&&number(r.alpha)&&number(r.beta)&&number(r.gamma))t.rotation={alpha:r.alpha,beta:r.beta,gamma:r.gamma};
  t.gForce=number(input.gForce)&&input.gForce>=0?input.gForce:null;t.motionAt=optional(input.motionAt);t.heading=number(input.heading)&&input.heading>=0&&input.heading<360?input.heading:null;t.headingAt=optional(input.headingAt);t.orientationAt=optional(input.orientationAt);
  t.gpsError=typeof input.gpsError==='string'?input.gpsError.slice(0,300):'';
  return t;
}
export function readingState(status:SensorStatus,at:number|null,now:number,maxAge=5000){return status==='active'?at===null?'Waiting for readings':now-at>maxAge?'Reading is stale':'Receiving readings':({off:'Not started',requesting:'Requesting permission',waiting:'Waiting for readings',denied:'Permission denied',unavailable:'Unavailable',error:'Needs attention'}[status]);}
