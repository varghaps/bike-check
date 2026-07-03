// Manfred Bike Finder — Android PWA
// Finds the closest free-floating Manfred bikes and reads the nearest one aloud.
// Pure ranking logic mirrors scriptable/manfred_nearest.js; the platform layer
// uses browser APIs (geolocation, fetch, Web Speech) instead of Scriptable.

// Configuration
const FEED_URL='/manfred/free_bike_status.json';  // proxied by vercel.json (avoids CORS)
const DEFAULT_MAX_METERS=800;                     // search radius
const DEFAULT_TYPE='bike';                         // "bike" (non-electric) | "ebike" | "any"
const LOCATION_TIMEOUT_MS=15000;
const WALK_SPEED_MPS=1.35;                          // ~4.9 km/h for walk-time estimate

// --- pure helpers (ported verbatim from the Scriptable script) ---
const toRad=d=>d*Math.PI/180;
function haversine(a,b,c,d){const R=6371000,D1=toRad(c-a),D2=toRad(d-b),A=Math.sin(D1/2)**2+Math.cos(toRad(a))*Math.cos(toRad(c))*Math.sin(D2/2)**2;return 2*R*Math.atan2(Math.sqrt(A),Math.sqrt(1-A));}
function bearing(a,b,c,d){const p1=toRad(a),p2=toRad(c),dl=toRad(d-b);const y=Math.sin(dl)*Math.cos(p2);const x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);return (Math.atan2(y,x)*180/Math.PI+360)%360;}
const ARROWS=['↑','↗','→','↘','↓','↙','←','↖'];
const arrow=deg=>ARROWS[Math.round(deg/45)%8];
const DIR_HU={'↑':'észak','↗':'északkelet','→':'kelet','↘':'délkelet','↓':'dél','↙':'délnyugat','←':'nyugat','↖':'északnyugat'};
const matchesType=(v,t)=>t==='any'?true:v?.vehicle_type_id===t;

// --- DOM refs ---
const $=id=>document.getElementById(id);
const statusEl=$('status'), listEl=$('list'), findBtn=$('find'), speakBtn=$('speak');
let lastSpoken='';   // remembered so the 🔊 button can repeat it

function setStatus(msg){statusEl.textContent=msg;}

// --- platform layer ---
function getLocation(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation)return reject(new Error('A böngésző nem támogatja a helymeghatározást.'));
    navigator.geolocation.getCurrentPosition(
      p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude}),
      e=>reject(new Error(e.code===1?'Helyhozzáférés megtagadva.':'Nem sikerült lekérni a helyzeted.')),
      {enableHighAccuracy:true,timeout:LOCATION_TIMEOUT_MS,maximumAge:0}
    );
  });
}

async function fetchBikes(){
  const r=await fetch(FEED_URL,{cache:'no-store'});
  if(!r.ok)throw new Error(`Feed hiba (HTTP ${r.status}).`);
  const j=await r.json();
  const v=j?.data?.vehicles||[];
  if(!v.length)throw new Error('A feed üres.');
  return v;
}

// --- ranking (mirrors the Scriptable filter-and-rank step) ---
function rank(bikes,me,type,maxMeters){
  const candidates=[];let nearestAny=null;
  for(const v of bikes){
    if(v?.is_disabled===true||v?.is_reserved===true)continue;
    if(!matchesType(v,type))continue;
    const lat=Number(v?.lat),lon=Number(v?.lon);
    if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
    const dist=haversine(me.lat,me.lon,lat,lon);
    const bear=arrow(bearing(me.lat,me.lon,lat,lon));
    const rec={id:v.vehicle_id,vtype:v.vehicle_type_id,lat,lon,dist,bear};
    if(!nearestAny||dist<nearestAny.dist)nearestAny=rec;
    if(dist<=maxMeters)candidates.push(rec);
  }
  candidates.sort((a,b)=>a.dist-b.dist);
  const picks=candidates.slice(0,3);
  return {picks:picks.length?picks:(nearestAny?[nearestAny]:[]),withinRadius:picks.length>0};
}

// --- output formatting ---
const distFmt=m=>m>=1000?`${(m/1000).toFixed(1)} km`:`${Math.round(m)} m`;
const walkFmt=m=>{const min=Math.max(1,Math.round(m/WALK_SPEED_MPS/60));return `${min} perc gyalog`;};
const navUrl=p=>`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=walking`;

function renderSpoken(p,withinRadius){
  const kind=p.vtype==='ebike'?'elektromos bicaj':'bicaj';
  const dist=`${Math.round(p.dist)} méter`;
  const dir=DIR_HU[p.bear];
  const core=`A legközelebbi ${kind} ${dist}re van${dir?', '+dir+' felé':''}.`;
  return withinRadius?core:`A keresési sugáron belül nincs bicaj. ${core}`;
}

function render(picks,withinRadius){
  listEl.innerHTML='';
  picks.forEach((p,i)=>{
    const kind=p.vtype==='ebike'?'⚡ elektromos':'🚲 bicaj';
    const card=document.createElement('a');
    card.className='card';
    card.href=navUrl(p);
    card.target='_blank';card.rel='noopener';
    card.innerHTML=`
      <div class="rank">${i+1}</div>
      <div class="body">
        <div class="dist">${distFmt(p.dist)} <span class="arrow">${p.bear}</span></div>
        <div class="meta">${kind} · ${walkFmt(p.dist)} · ${DIR_HU[p.bear]} felé</div>
      </div>
      <div class="go">Térkép ›</div>`;
    listEl.appendChild(card);
  });
  speakBtn.hidden=picks.length===0;
}

// --- voice ---
function speak(text){
  if(!('speechSynthesis'in window)||!text)return;
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);
  u.lang='hu-HU';
  speechSynthesis.speak(u);
}

// --- main flow (triggered by a user tap → satisfies the browser gesture rule) ---
async function run(){
  const type=document.querySelector('input[name=type]:checked')?.value||DEFAULT_TYPE;
  findBtn.disabled=true;
  listEl.innerHTML='';speakBtn.hidden=true;
  try{
    setStatus('Helyzet lekérése…');
    const me=await getLocation();
    setStatus('Bicajok keresése…');
    const bikes=await fetchBikes();
    const {picks,withinRadius}=rank(bikes,me,type,DEFAULT_MAX_METERS);
    if(!picks.length){setStatus('Nincs elérhető Manfred bicaj.');lastSpoken='Nincs elérhető Manfred bicaj.';speak(lastSpoken);return;}
    render(picks,withinRadius);
    setStatus(withinRadius?`${picks.length} bicaj ${DEFAULT_MAX_METERS} méteren belül`:'Nincs a sugáron belül — a legközelebbi:');
    lastSpoken=renderSpoken(picks[0],withinRadius);
    speak(lastSpoken);           // auto-read the nearest (tap gesture allows it)
  }catch(e){
    setStatus(e.message||String(e));
  }finally{
    findBtn.disabled=false;
  }
}

findBtn.addEventListener('click',run);
speakBtn.addEventListener('click',()=>speak(lastSpoken));

// register service worker (installability)
if('serviceWorker'in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
