import React from 'react';
import {emptyTelemetry,type Telemetry} from '../mobile/telemetry';
import {readingState} from '../mobile/phoneReadings';
const value=(v:number|null|undefined,unit='',digits=2)=>v==null?'Not reported':`${v.toFixed(digits)}${unit}`;
export function RoadPhoneSensors({readings,receivedAt,now}:{readings:Telemetry|null;receivedAt:number;now:number}){
  const t=readings??emptyTelemetry(),stale=!!receivedAt&&now-receivedAt>5000;
  const state=(status:Parameters<typeof readingState>[0],at:number|null,maxAge=5000)=>stale?'Phone disconnected / stale':readingState(status,at,now,maxAge);
  return <section className="road-phone-sensors" aria-label="Phone sensors in Road showcase">
    <div className="sensor-title"><h2>Phone sensors</h2><span role="status">{!receivedAt?'Pair phone and start camera & sensors':stale?'Waiting for fresh phone data':`Updated ${Math.max(0,Math.round((now-receivedAt)/1000))} s ago`}</span></div>
    <div className="road-sensor-grid">
      <article><h3>GPS & speed</h3><p>{state(t.gpsStatus,t.gps?.timestamp??null,15000)}</p><dl><dt>Latitude</dt><dd>{value(t.gps?.latitude,'',6)}</dd><dt>Longitude</dt><dd>{value(t.gps?.longitude,'',6)}</dd><dt>Accuracy</dt><dd>{value(t.gps?.accuracy,' m',0)}</dd><dt>Speed</dt><dd>{value(t.gps?.speedMps==null?null:t.gps.speedMps*3.6,' km/h',1)}</dd></dl>{t.gpsError&&<p>{t.gpsError}</p>}</article>
      <article><h3>Accelerometer</h3><p>{state(t.motionStatus,t.motionAt)}</p><dl><dt>Magnitude incl. gravity</dt><dd>{value(t.gForce,' g')}</dd><dt>X</dt><dd>{value(t.acceleration?.x,' m/s²')}</dd><dt>Y</dt><dd>{value(t.acceleration?.y,' m/s²')}</dd><dt>Z</dt><dd>{value(t.acceleration?.z,' m/s²')}</dd></dl></article>
      <article><h3>Gyroscope</h3><p>{state(t.gyroStatus,t.motionAt)}</p><dl><dt>Alpha</dt><dd>{value(t.rotation?.alpha,' °/s')}</dd><dt>Beta</dt><dd>{value(t.rotation?.beta,' °/s')}</dd><dt>Gamma</dt><dd>{value(t.rotation?.gamma,' °/s')}</dd></dl></article>
      <article><h3>Compass</h3><p>{state(t.compassStatus,t.headingAt)}</p><dl><dt>North heading</dt><dd>{value(t.heading,'°',0)}</dd><dt>GPS heading</dt><dd>{value(t.gps?.heading,'°',0)}</dd></dl><p>Permissions and sensor availability are controlled on the phone. Keep its camera page open.</p></article>
    </div>
  </section>;
}
