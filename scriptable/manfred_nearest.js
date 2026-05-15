// Manfred Nearest Bike Script for Scriptable
// Finds the 3 closest free-floating Manfred bikes (Budapest).
// Labels each pick with the nearest Bubi station name if within 50m,
// otherwise reverse-geocodes to a street address.

// Configuration
const FEED_URL='https://audit.manfred.mobi/gbfs/budapest/free_bike_status.json';   // Manfred GBFS v3 vehicle feed
const BUBI_STATION_URL='https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_bh/en/station_information.json'; // Bubi names (label source)
const DEFAULT_MAX_METERS=800;             // Default search radius in meters
const DEFAULT_TYPE='bike';                // "bike" (non-electric) | "ebike" | "any"
const STATION_LABEL_RADIUS=50;            // Reuse Bubi station name if a bike is within this many meters
const LOCATION_TIMEOUT_MS=15000;          // GPS location timeout
const GEOCODE_TIMEOUT_MS=3000;            // Per-call cap for Apple reverse geocode
const SHOW_DISTANCES=true;                // Append distance to each pick
const DEBUG=false;

// Error handling wrapper with step names for debugging
async function step(name,fn){try{return await fn();}catch(e){throw new Error(`[${name}] ${e&&e.message?e.message:String(e)}`);}}
// Fetch JSON with timeout
async function getJSON(url,timeout=15){const r=new Request(url);r.timeoutInterval=timeout;return await r.loadJSON();}
// Convert degrees to radians
function toRad(d){return d*Math.PI/180;}
// Haversine distance in meters
function haversine(a,b,c,d){const R=6371000,D1=toRad(c-a),D2=toRad(d-b),A=Math.sin(D1/2)**2+Math.cos(toRad(a))*Math.cos(toRad(c))*Math.sin(D2/2)**2;return 2*R*Math.atan2(Math.sqrt(A),Math.sqrt(1-A));}
// Bearing from (a,b) to (c,d) in degrees [0..360)
function bearing(a,b,c,d){const φ1=toRad(a),φ2=toRad(c),Δλ=toRad(d-b);const y=Math.sin(Δλ)*Math.cos(φ2);const x=Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);return (Math.atan2(y,x)*180/Math.PI+360)%360;}
// 8-point compass arrow for a bearing
function arrow(deg){const arrows=['↑','↗','→','↘','↓','↙','←','↖'];return arrows[Math.round(deg/45)%8];}
// Parse input from Shortcuts (number=radius, JSON=full params, empty=defaults)
function parseShortcutInput(){let raw=args.shortcutParameter;if(raw==null||raw==='')return{};if(typeof raw==='number')return{radius:raw};const s=String(raw);if(/^\s*[\d.]+\s*$/.test(s))return{radius:Number(s)};try{return JSON.parse(s);}catch{return{};}}
// Type filter: returns true if the vehicle matches the requested type
function matchesType(v,t){if(t==='any')return true;return v?.vehicle_type_id===t;}
// Reverse-geocode (lat,lon) to a short street label; returns null on timeout/error
async function reverseLabel(lat,lon){try{const p=Location.reverseGeocode(lat,lon);const to=new Promise((_,rj)=>Timer.schedule(GEOCODE_TIMEOUT_MS,false,()=>rj(new Error('geocode timeout'))));const arr=await Promise.race([p,to]);const r=Array.isArray(arr)?arr[0]:null;if(!r)return null;const street=r.thoroughfare||r.name||r.locality;const num=r.subThoroughfare?` ${r.subThoroughfare}`:'';return street?`${street}${num}`:null;}catch{return null;}}

(async()=>{try{
  // Step 1: Parse input parameters from Shortcuts
  const inp=await step('parse-input',async()=>parseShortcutInput());
  let maxMeters=Number(inp.radius);if(!Number.isFinite(maxMeters)||maxMeters<=0)maxMeters=DEFAULT_MAX_METERS;
  let type=typeof inp.type==='string'?inp.type.toLowerCase():DEFAULT_TYPE;
  if(!['bike','ebike','any'].includes(type))type=DEFAULT_TYPE;

  // Step 2: Get current location (or use coords from Shortcut input)
  const {myLat,myLon}=await step('get-location',async()=>{
    let lat=Number(inp.lat),lon=Number(inp.lon);
    if(!(Number.isFinite(lat)&&Number.isFinite(lon))){
      const locCheck=new Request("https://scriptable.app/location-check");
      locCheck.timeoutInterval=LOCATION_TIMEOUT_MS/1000;await locCheck.load();
      Location.setAccuracyToBest(true);const loc=await Location.current();lat=loc.latitude;lon=loc.longitude;
    }
    return{myLat:lat,myLon:lon};
  });

  // Step 3: Fetch Manfred bikes and Bubi station names in parallel
  const {bikes,stations}=await step('fetch-feeds',async()=>{
    const [m,b]=await Promise.allSettled([getJSON(FEED_URL),getJSON(BUBI_STATION_URL)]);
    if(m.status!=='fulfilled')throw new Error(`manfred feed: ${m.reason&&m.reason.message||m.reason}`);
    const vehicles=m.value?.data?.vehicles||[];
    if(!vehicles.length)throw new Error('empty manfred feed');
    const sts=b.status==='fulfilled'?(b.value?.data?.stations||[]):[]; // label source is best-effort
    return{bikes:vehicles,stations:sts};
  });

  // Step 4: Filter and rank
  const {picks,nearestAny}=await step('filter-and-rank',async()=>{
    const candidates=[];let nearestAny=null;
    for(const v of bikes){
      if(v?.is_disabled===true||v?.is_reserved===true)continue;
      if(!matchesType(v,type))continue;
      const lat=Number(v?.lat),lon=Number(v?.lon);
      if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
      const dist=haversine(myLat,myLon,lat,lon);
      const rec={id:v.vehicle_id,vtype:v.vehicle_type_id,lat,lon,dist};
      if(!nearestAny||dist<nearestAny.dist)nearestAny=rec;
      if(dist<=maxMeters)candidates.push(rec);
    }
    candidates.sort((a,b)=>a.dist-b.dist);
    return{picks:candidates.slice(0,3),nearestAny};
  });

  // Step 5: Label each pick (Bubi station name → reverse geocode → distance+arrow)
  const labelled=await step('label-picks',async()=>{
    const list=picks.length?picks:(nearestAny?[nearestAny]:[]);
    return await Promise.all(list.map(async p=>{
      // A) nearest Bubi station within radius
      let best=null;
      for(const s of stations){
        const d=haversine(p.lat,p.lon,s.lat,s.lon);
        if(d<=STATION_LABEL_RADIUS&&(!best||d<best.d))best={name:s.name,d};
      }
      if(best)return{...p,label:best.name};
      // B) reverse geocode fallback
      const street=await reverseLabel(p.lat,p.lon);
      if(street)return{...p,label:street};
      // C) bearing-only fallback
      return{...p,label:null,bear:arrow(bearing(myLat,myLon,p.lat,p.lon))};
    }));
  });

  // Step 6: Format output line + notification
  const distFmt=m=>`${Math.round(m)}m`;
  const renderItem=p=>{
    const tag=p.vtype==='ebike'?' ⚡':'';
    if(p.label){return SHOW_DISTANCES?`${p.label}${tag} · ${distFmt(p.dist)}`:`${p.label}${tag}`;}
    return `${distFmt(p.dist)} ${p.bear||''}${tag}`.trim();
  };

  const n=new Notification();
  if(picks.length){
    const line=labelled.map(renderItem).join(' | ');
    n.title=`Manfred bikes${type!=='bike'?` (${type})`:''}`;
    n.body=line;
    const openURL=`maps://?daddr=${labelled[0].lat},${labelled[0].lon}&dirflg=w`;
    n.addAction('Navigate #1',openURL);
    if(labelled[1])n.addAction('Navigate #2',`maps://?daddr=${labelled[1].lat},${labelled[1].lon}&dirflg=w`);
    if(labelled[2])n.addAction('Navigate #3',`maps://?daddr=${labelled[2].lat},${labelled[2].lon}&dirflg=w`);
    n.openURL=openURL;Script.setShortcutOutput(line);
  }else{
    n.title='No Manfred bikes within radius';
    if(labelled[0]){
      const line=renderItem(labelled[0]);
      n.body=line;
      const openURL=`maps://?daddr=${labelled[0].lat},${labelled[0].lon}&dirflg=w`;
      n.addAction('Navigate',openURL);n.openURL=openURL;Script.setShortcutOutput(line);
    }else{
      n.body='No bikes found';Script.setShortcutOutput('No bikes found');
    }
  }
  await n.schedule();Script.complete();
}catch(e){
  const msg=e&&e.message?e.message:String(e);
  const n=new Notification();n.title='Manfred script error';n.body=msg;await n.schedule();
  Script.setShortcutOutput(`Manfred script error: ${msg}`);Script.complete();
}})();
