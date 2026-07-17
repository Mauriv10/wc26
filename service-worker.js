importScripts("./app-config.js");
const CACHE_NAME=self.WC26_CONFIG?.cacheName||"wc26-build-703-4-4";
const NO_CACHE_FILES=["service-worker.js","version.json","app-config.js","supabase-config.js"];
const NETWORK_FIRST_FILES=["index.html","app.js","auth.js","styles.css","manifest.webmanifest"];
const ASSETS=["./","./index.html","./styles.css","./app.js","./auth.js","./app-config.js","./assets/vendor/jszip.min.js","./manifest.webmanifest","./data/inventory.json","./data/projects-seed.json","./data/flags-v4.json","./data/team-groups.json","./assets/flags/mexico.svg","./assets/flags/sudafrica.svg","./assets/flags/corea-del-sur.svg","./assets/flags/chequia.svg","./assets/flags/canada.svg","./assets/flags/bosnia-y-herzegovina.svg","./assets/flags/catar.svg","./assets/flags/suiza.svg","./assets/flags/brasil.svg","./assets/flags/marruecos.svg","./assets/flags/haiti.svg","./assets/flags/escocia.svg","./assets/flags/estados-unidos.svg","./assets/flags/paraguay.svg","./assets/flags/australia.svg","./assets/flags/turquia.svg","./assets/flags/alemania.svg","./assets/flags/curazao.svg","./assets/flags/costa-de-marfil.svg","./assets/flags/ecuador.svg","./assets/flags/paises-bajos.svg","./assets/flags/japon.svg","./assets/flags/suecia.svg","./assets/flags/tunez.svg","./assets/flags/belgica.svg","./assets/flags/egipto.svg","./assets/flags/iran.svg","./assets/flags/nueva-zelanda.svg","./assets/flags/espana.svg","./assets/flags/cabo-verde.svg","./assets/flags/arabia-saudita.svg","./assets/flags/uruguay.svg","./assets/flags/francia.svg","./assets/flags/senegal.svg","./assets/flags/irak.svg","./assets/flags/noruega.svg","./assets/flags/argentina.svg","./assets/flags/argelia.svg","./assets/flags/austria.svg","./assets/flags/jordania.svg","./assets/flags/portugal.svg","./assets/flags/rd-congo.svg","./assets/flags/uzbekistan.svg","./assets/flags/colombia.svg","./assets/flags/inglaterra.svg","./assets/flags/croacia.svg","./assets/flags/ghana.svg","./assets/flags/panama.svg","./assets/flags/fwc.svg","./assets/icons/world-cup-2026-apple-v522.png","./assets/icons/world-cup-2026-192-v522.png","./assets/icons/world-cup-2026-512-v522.png"];

self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener("message",event=>{
 if(event.data?.type==="SKIP_WAITING")self.skipWaiting();
});

async function networkFirst(request){
 const cache=await caches.open(CACHE_NAME);
 try{
   const response=await fetch(request,{cache:"no-store"});
   if(response&&response.ok)cache.put(request,response.clone());
   return response;
 }catch(error){
   return (await cache.match(request))||(await caches.match("./index.html"));
 }
}

self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET")return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 const file=url.pathname.split("/").pop()||"index.html";

 if(NO_CACHE_FILES.includes(file)){
   event.respondWith(fetch(event.request,{cache:"no-store"}));
   return;
 }

 if(event.request.mode==="navigate"||NETWORK_FIRST_FILES.includes(file)){
   event.respondWith(networkFirst(event.request));
   return;
 }

 event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
   if(response&&response.ok){
     const copy=response.clone();
     caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
   }
   return response;
 })));
});
