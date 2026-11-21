import React,{useEffect,useRef,useState} from 'react';
import {LocateFixed} from 'lucide-react';
import type {GPSFix} from '../mobile/telemetry';
import {loadGoogleMaps} from '../services/googleMaps';
import 'leaflet/dist/leaflet.css';
const GOOGLE_KEY=import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
type MapHandle={update:(fix:GPSFix,heading:number|null,follow:boolean)=>void;destroy:()=>void};
export function PhoneLocationMap({fix,heading,stale}:{fix:GPSFix|null;heading:number|null;stale:boolean}){
  const host=useRef<HTMLDivElement>(null);const map=useRef<MapHandle|null>(null);const latest=useRef({fix,heading});latest.current={fix,heading};
  const [provider,setProvider]=useState(GOOGLE_KEY?'Google Maps':'OpenStreetMap');const [message,setMessage]=useState(GOOGLE_KEY?'':'Google Maps is ready to configure. No browser key is set.');const [follow,setFollow]=useState(true);const [retry,setRetry]=useState(0);const [tryGoogle,setTryGoogle]=useState(!!GOOGLE_KEY);
  const hasFix=!!fix;
  useEffect(()=>{
    if(!hasFix||!host.current)return;const container=host.current;let cancelled=false;let handle:MapHandle|null=null;
    const fallback=async()=>{
      const L=(await import('leaflet')).default;if(cancelled)return;const f=latest.current.fix!;
      const m=L.map(container,{zoomControl:true,scrollWheelZoom:false}).setView([f.latitude,f.longitude],16);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(m);
      const dot=L.circleMarker([f.latitude,f.longitude],{radius:7,color:'#fff',weight:2,fillColor:'#526f3e',fillOpacity:1}).addTo(m);const accuracy=L.circle([f.latitude,f.longitude],{radius:f.accuracy,color:'#718b50',weight:1,fillOpacity:.1}).addTo(m);
      m.on('dragstart',()=>setFollow(false));m.on('tileerror',()=>setMessage('Map tiles are unavailable. GPS coordinates remain available.'));
      const resize=new ResizeObserver(()=>m.invalidateSize({animate:false}));resize.observe(container);
      handle={update:(next,_heading,following)=>{dot.setLatLng([next.latitude,next.longitude]);accuracy.setLatLng([next.latitude,next.longitude]).setRadius(next.accuracy);if(following)m.panTo([next.latitude,next.longitude],{animate:false});},destroy:()=>{resize.disconnect();m.remove();}};map.current=handle;setProvider('OpenStreetMap');
    };
    const init=async()=>{
      if(!GOOGLE_KEY||!tryGoogle){await fallback();return;}
      try{
        const gm=await loadGoogleMaps(GOOGLE_KEY);if(cancelled)return;const f=latest.current.fix!;const position={lat:f.latitude,lng:f.longitude};
        const m=new gm.Map(container,{center:position,zoom:16,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,gestureHandling:'cooperative'});
        const marker=new gm.Marker({map:m,position,title:'Your phone GPS position',icon:{path:gm.SymbolPath.CIRCLE,scale:7,fillColor:'#526f3e',fillOpacity:1,strokeColor:'#fff',strokeWeight:2}});const circle=new gm.Circle({map:m,center:position,radius:f.accuracy,fillColor:'#718b50',fillOpacity:.12,strokeColor:'#718b50',strokeOpacity:.5,strokeWeight:1});
        m.addListener('dragstart',()=>setFollow(false));handle={update:(next,h,following)=>{const p={lat:next.latitude,lng:next.longitude};marker.setPosition(p);marker.setIcon({path:h==null?gm.SymbolPath.CIRCLE:gm.SymbolPath.FORWARD_CLOSED_ARROW,rotation:h||0,scale:h==null?7:5,fillColor:'#526f3e',fillOpacity:1,strokeColor:'#fff',strokeWeight:2});circle.setCenter(p);circle.setRadius(next.accuracy);if(following)m.panTo(p);},destroy:()=>{gm.event.clearInstanceListeners(m);marker.setMap(null);circle.setMap(null);container.replaceChildren();}};map.current=handle;setProvider('Google Maps');setMessage('');handle.update(f,latest.current.heading,true);
      }catch{if(!cancelled){setMessage('Google Maps could not load. Showing OpenStreetMap; GPS is still available.');await fallback();}}
    };
    void init();return()=>{cancelled=true;handle?.destroy();map.current=null;};
  },[hasFix,retry,tryGoogle]);
  useEffect(()=>{if(fix)map.current?.update(fix,heading,follow);},[fix,heading,follow]);
  useEffect(()=>{const failed=()=>{setMessage('Google Maps rejected the key or website. Showing OpenStreetMap.');setTryGoogle(false);};window.addEventListener('margai:maps-auth-error',failed);return()=>window.removeEventListener('margai:maps-auth-error',failed);},[]);
  return <section className="phone-location-map"><div className="sensor-title"><h2>Live GPS map</h2><span>{hasFix?provider:'Waiting for GPS'}</span></div><div className="phone-map-surface" ref={host} aria-label="Map of the phone GPS position" hidden={!hasFix}/>{!hasFix&&<p className="phone-map-wait">Enable location to show your actual position. No default location is substituted.</p>}{hasFix&&<div className="phone-map-controls"><span>{stale?'GPS reading is stale':`Accuracy ±${Math.round(fix!.accuracy)} m`}</span><button className="text-button" onClick={()=>setFollow(true)}><LocateFixed size={15}/>Follow phone</button><a href={`https://www.google.com/maps/search/?api=1&query=${fix!.latitude},${fix!.longitude}`} target="_blank" rel="noreferrer">Open in Google Maps</a></div>}{message&&<p className="phone-note">{message}{GOOGLE_KEY&&<button className="text-button" onClick={()=>{setTryGoogle(true);setRetry(x=>x+1);}}>Retry map</button>}</p>}</section>;
}
