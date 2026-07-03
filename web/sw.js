// Minimal service worker — required for PWA installability.
// Caches the app shell so the icon launches instantly; the bike feed is
// always fetched live from the network (never cached).

const CACHE='manfred-shell-v1';
const SHELL=['./','./index.html','./app.js','./manifest.json','./icons/icon-192.png','./icons/icon-512.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  // Never cache the live feed proxy — always go to network.
  if(url.pathname.startsWith('/manfred/')){e.respondWith(fetch(e.request));return;}
  // App shell: cache-first, fall back to network.
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
