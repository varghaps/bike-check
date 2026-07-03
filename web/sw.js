// Minimal service worker — required for PWA installability.
// Strategy: network-first for the app shell so an online user always gets the
// latest deploy; the cache is only an offline fallback. The live feed is never
// cached. Bump CACHE to force old caches to be purged on activate.

const CACHE='manfred-shell-v2';
const SHELL=['./','./index.html','./app.js','./manifest.json','./icons/icon-192.png','./icons/icon-512.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  // Never cache the live feed proxy — always go to network.
  if(url.pathname.startsWith('/manfred/')){e.respondWith(fetch(req));return;}
  // App shell (and everything same-origin): network-first, fall back to cache offline.
  e.respondWith(
    fetch(req).then(res=>{
      if(res.ok&&url.origin===location.origin){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));}
      return res;
    }).catch(()=>caches.match(req).then(r=>r||caches.match('./index.html')))
  );
});
