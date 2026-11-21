let pending:Promise<any>|null=null;
/** One script shared by the live location map and the drive demo. */
export function loadGoogleMaps(key:string):Promise<any>{
  const w=window as any;
  if(w.google?.maps?.Map)return Promise.resolve(w.google.maps);
  if(pending)return pending;
  pending=new Promise((resolve,reject)=>{
    const script=document.createElement('script');let settled=false;
    const fail=(message:string)=>{if(settled)return;settled=true;clearTimeout(timer);script.remove();pending=null;reject(new Error(message));};
    const timer=setTimeout(()=>fail('Google Maps did not respond. Check your connection and API key.'),12000);
    w.__margaiMapsReady=()=>{if(settled)return;settled=true;clearTimeout(timer);resolve(w.google.maps);};
    w.gm_authFailure=()=>{fail('Google Maps could not authorize this website. Check API key and referrer restrictions.');window.dispatchEvent(new Event('margai:maps-auth-error'));};
    const url=new URL('https://maps.googleapis.com/maps/api/js');url.searchParams.set('key',key);url.searchParams.set('loading','async');url.searchParams.set('callback','__margaiMapsReady');url.searchParams.set('v','weekly');
    script.async=true;script.src=url.href;script.onerror=()=>fail('Google Maps could not load. Check the connection.');document.head.appendChild(script);
  });return pending;
}
