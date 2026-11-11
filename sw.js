// Coquille PWA seulement : aucune donnée bancaire mise en cache par le service worker.
const CACHE='homebank-mobile-shell-final-readonly-20261111';
const ASSETS=['./index.html','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('compagnon-shell-')||k.startsWith('homebank-mobile-shell-')||k.startsWith('homebank-mobile-demo-'))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);
 if(u.origin!==self.location.origin)return;
 const path=u.pathname.split('/').pop();
 if(!['','index.html','app.js','manifest.webmanifest','icon-192.png','icon-512.png','sw.js'].includes(path))return;
 // Réseau d'abord pour éviter de rester bloqué sur une ancienne version installée.
 e.respondWith(fetch(e.request).then(r=>{if(r.ok&&r.type==='basic'){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match(e.request)));
});
