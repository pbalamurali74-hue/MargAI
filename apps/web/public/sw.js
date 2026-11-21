/* Relative scope supports both / and GitHub project paths. API requests are never cached. */
const CACHE='margai-camera-v3';
const base=new URL('./',self.location.href);
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([base.href])).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('margai-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==base.origin||/\/(v1|api|health)(\/|$)/.test(url.pathname))return;
if(request.mode==='navigate'){event.respondWith(fetch(request).catch(()=>caches.match(base.href)));return;}
if(/\.(wasm|onnx|tflite|js|mjs|css|png|svg)$/.test(url.pathname))event.respondWith(caches.match(request).then(hit=>hit||fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;})));});
