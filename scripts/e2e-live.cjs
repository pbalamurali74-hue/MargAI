// Phone -> relay -> (website watcher + paired infotainment). Run with the API up: node scripts/e2e-live.cjs
const WebSocket=require('ws');
const env=(eventName,payload,inputMode='live')=>JSON.stringify({schemaVersion:'1.0',messageId:'m'+Math.random(),eventName,sentAt:new Date().toISOString(),inputMode,payload});
const open=(name)=>new Promise(r=>{const ws=new WebSocket('ws://localhost:8080/v1/relay');const got=[];ws.on('message',d=>{const e=JSON.parse(d);got.push(e);});ws.on('open',()=>r({ws,got,name}));});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const lat=19.0760,lon=72.8777; // Mumbai: proves the open_road corridor works outside Bengaluru
  const watcher=await open('watcher');watcher.ws.send(env('watch.join',{}));
  const car=await open('car');car.ws.send(env('pair.join',{code:'ABCD',role:'car'}));
  const phone=await open('phone');phone.ws.send(env('pair.join',{code:'ABCD',role:'phone'}));
  const driver=await open('driver');
  const pose={latitude:lat-0.0030,longitude:lon,headingDeg:0,speedMps:12,horizontalAccuracyM:5};
  driver.ws.send(env('subscription.replace',{clientId:'drv',corridorId:'open_road',currentEdgeId:'open_h0',upcomingEdgeIds:['open_h1','open_h7'],vehiclePose:pose}));
  await wait(300);
  const kinds=[['pothole','pothole'],['cow','animal'],['fog','low_visibility'],['accident','suspected_incident']];
  for(const [cls] of kinds){phone.ws.send(env('observation.submit',{id:'o_'+cls,sourceId:'phone1',captureTime:new Date().toISOString(),vehiclePose:{latitude:lat-0.0003,longitude:lon+Math.random()*1e-5,headingDeg:0,speedMps:10,horizontalAccuracyM:5},estimatedHazardLocation:{latitude:lat+Math.random()*3e-4,longitude:lon,horizontalAccuracyM:8,provenance:'estimated'},perceptionOutput:[{class:cls,confidence:.8,bbox:{x:.4,y:.5,width:.2,height:.2},frameTimeMs:30,modelVersion:'test'}],inputMode:'live'}));await wait(150);}
  phone.ws.send(env('infotainment.push',{kind:'alert',text:'Cattle ahead'}));
  await wait(600);
  const ev=c=>c.got.map(e=>e.eventName+(e.payload?.hazard?':'+e.payload.hazard.type:'')+(e.payload?.deliveredToDisplays!==undefined?':delivered='+e.payload.deliveredToDisplays:'')).join(' | ');
  console.log('watcher:',ev(watcher));console.log('car:',ev(car));console.log('phone:',ev(phone));console.log('driver:',ev(driver));
  process.exit(0);
})();
