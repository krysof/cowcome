const CACHE='niulai-20260821-13';
const ROOT=new URL('./',self.location.href);
const CORE=['./','manifest.webmanifest','game-core.wasm','icons/niulai-v2-192.png','icons/niulai-v2-512.png','icons/niulai-v2-maskable-512.png','icons/apple-touch-icon-v2.png','portraits/orange-niulai.png','portraits/yellow-bull.png','portraits/leopard.png','audio/enemy-near.mp3'].map(path=>new URL(path,ROOT).href);

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));return response;}).catch(()=>caches.match(request).then(hit=>hit||caches.match(new URL('./',ROOT).href))));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;})));
});
