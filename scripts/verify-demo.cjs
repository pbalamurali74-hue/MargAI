const assert = require('node:assert/strict');
const WebSocket = require('ws');
const origin = process.env.API_ORIGIN || 'http://localhost:8080';
const envelope = (eventName,payload) => JSON.stringify({schemaVersion:'1.0',messageId:crypto.randomUUID(),eventName,sentAt:new Date().toISOString(),inputMode:'simulated',payload});
async function json(path, options){const r=await fetch(origin+path,options);assert.ok(r.ok,`${path}: ${r.status}`);return r.json();}
async function socket(){const ws=new WebSocket(origin.replace(/^http/,'ws')+'/v1/relay');ws.events=[];ws.on('message',d=>ws.events.push(JSON.parse(d)));await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return ws;}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const clients=[];try{
assert.equal((await json('/health')).status,'ok');
assert.ok(Array.isArray(await json('/v1/hazards')));
assert.ok(Array.isArray(await json('/v1/cases')));
const bad=await fetch(origin+'/v1/observations',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(bad.status,400);
const watch=await socket();clients.push(watch);watch.send(envelope('watch.join',{}));
const car=await socket();clients.push(car);car.send(envelope('pair.join',{code:'TEST88',role:'car'}));
const phone=await socket();clients.push(phone);phone.send(envelope('pair.join',{code:'TEST88',role:'phone'}));await wait(100);
const other=await socket();clients.push(other);other.send(envelope('pair.join',{code:'OTHER88',role:'car'}));await wait(100);
const frame='data:image/jpeg;base64,dGVzdC1mcmFtZQ==';
phone.send(envelope('infotainment.push',{kind:'alert',text:'Demo warning',camera_b64:frame,hazards:[]}));await wait(200);
assert.ok(watch.events.some(e=>e.eventName==='watch.snapshot'));
assert.ok(car.events.some(e=>e.eventName==='infotainment.update'&&e.payload.text==='Demo warning'));
assert.ok(phone.events.some(e=>e.payload?.deliveredToDisplays===1));
assert.ok(car.events.some(e=>e.eventName==='infotainment.update'&&e.payload.camera_b64===frame));
assert.ok(!other.events.some(e=>e.eventName==='infotainment.update'));
console.log('PASS: health, hazards, cases, input validation, watcher snapshot, phone → relay → car, delivery acknowledgement, camera frame payload, room isolation');
}finally{clients.forEach(ws=>ws.close());}})().catch(e=>{console.error(e);process.exitCode=1;});
