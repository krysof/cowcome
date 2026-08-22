const CACHE='niulai-20260822-9';
const ROOT=new URL('./',self.location.href);
const CORE=['./','manifest.webmanifest','game-core.wasm','icons/niulai-v2-192.png','icons/niulai-v2-512.png','icons/niulai-v2-maskable-512.png','icons/apple-touch-icon-v2.png','portraits/orange-niulai.png','portraits/yellow-bull.png','portraits/leopard.png','audio/enemy-near.mp3'].map(path=>new URL(path,ROOT).href);

async function precacheApp(){
  const cache=await caches.open(CACHE);
  await cache.addAll(CORE);
  // Vite 会为主脚本和样式生成哈希文件名；从已缓存的入口页发现并立即缓存它们，
  // 保证用户首次安装 PWA 后即使没有再次联网刷新，也能完整离线启动。
  const shell=await cache.match(new URL('./',ROOT).href);
  if(!shell)return;
  const html=await shell.text(),urls=[];
  for(const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)){
    if(!match[1]||match[1].startsWith('data:'))continue;
    const url=new URL(match[1],ROOT);
    if(url.origin===self.location.origin)urls.push(url.href);
  }
  await cache.addAll([...new Set(urls)]);
}

self.addEventListener('install',event=>{
  event.waitUntil(precacheApp().then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});

self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));return response;}).catch(()=>caches.match(request).then(hit=>hit||caches.match(new URL('./',ROOT).href))));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}return response;})));
});
