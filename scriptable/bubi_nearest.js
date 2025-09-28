// Bubi Nearest Station Script for Scriptable
// This script finds the nearest bike sharing station

const NETWORK='nextbike_bh';
const DEFAULT_MAX_METERS=800;
const LOCATION_TIMEOUT_MS=15000;
const ALLOW_FALLBACK_COORDS=false;
const SHOW_DISTANCES=true;
const DEBUG=false;

async function step(name,fn){try{return await fn();}catch(e){throw new Error(`[${name}] ${e&&e.message?e.message:String(e)}`);}}
async function getJSON(url,timeout=15){const r=new Request(url);r.timeoutInterval=timeout;return await r.loadJSON();}
function toRad(d){return d*Math.PI/180;}function haversine(a,b,c,d){const R=6371000,D1=toRad(c-a),D2=toRad(d-b),A=Math.sin(D1/2)**2+Math.cos(toRad(a))*Math.cos(toRad(c))*Math.sin(D2/2)**2;return 2*R*Math.atan2(Math.sqrt(A),Math.sqrt(1-A));}
function parseShortcutInput(){let raw=args.shortcutParameter;if(raw==null||raw==='')return{};if(typeof raw==='number')return{radius:raw};const s=String(raw);if(/^\s*[\d.]+\s*$/.test(s))return{radius:Number(s)};try{return JSON.parse(s);}catch{return{};}}
function getBikeCount(s){let n=Number(s?.num_bikes_available??s?.num_vehicles_available??0);if(!Number.isFinite(n)||n<0)n=0;if(Array.isArray(s?.vehicle_types_available)){n=Math.max(n,s.vehicle_types_available.reduce((x,v)=>{const c=Number(v?.count??0);return x+(Number.isFinite(c)?c:0);},0));}if(s?.num_bikes_available_types&&typeof s.num_bikes_available_types==='object'){n=Math.max(n,Object.values(s.num_bikes_available_types).reduce((x,v)=>{const c=Number(v??0);return x+(Number.isFinite(c)?c:0);},0));}return n;}
function rentingOKTolerant(s){const f=s?.is_renting;if(f===undefined||f===true||f===1||f==="1"||f==="true")return true;if(f===0||f==="0"||f===false||f==="false")return false;return true;}

(async()=>{try{
  const inp=await step('parse-input',async()=>parseShortcutInput());
  let maxMeters=Number(inp.radius);if(!Number.isFinite(maxMeters)||maxMeters<=0)maxMeters=DEFAULT_MAX_METERS;

  const {myLat,myLon}=await step('get-location',async()=>{
    let lat=Number(inp.lat),lon=Number(inp.lon);
    if(!(Number.isFinite(lat)&&Number.isFinite(lon))){
      const locCheck=new Request("https://scriptable.app/location-check");
      locCheck.timeoutInterval=LOCATION_TIMEOUT_MS/1000;await locCheck.load();
      Location.setAccuracyToBest(true);const loc=await Location.current();lat=loc.latitude;lon=loc.longitude;
    }
    return{myLat:lat,myLon:lon};
  });

  const {infoUrl,statusUrl}=await step('discover-gbfs',async()=>{
    const roots=[`https://gbfs.nextbike.net/maps/gbfs/v2/${NETWORK}/gbfs.json`,`https://api.nextbike.net/maps/gbfs/v1/${NETWORK}/gbfs.json`];
    let idx=null;for(const r of roots){try{idx=await getJSON(r,15);break;}catch{}}
    if(!idx)throw new Error('discovery failed');
    const langs=idx?.data||{};const lk=langs.en?'en':Object.keys(langs)[0];if(!lk)throw new Error('no language keys');
    const feeds=Object.fromEntries((langs[lk].feeds||[]).map(f=>[f.name,f.url]));
    const info=feeds['station_information'],status=feeds['station_status'];
    if(!info||!status)throw new Error('missing feeds');return{infoUrl:info,statusUrl:status};
  });

  const {stationsInfo,stationsStatus}=await step('fetch-feeds',async()=>{
    const [info,status]=await Promise.all([getJSON(infoUrl),getJSON(statusUrl)]);
    const si=info?.data?.stations||[], ss=status?.data?.stations||[];
    if(!si.length||!ss.length)throw new Error(`empty feeds info=${si.length} status=${ss.length}`);
    return{stationsInfo:si,stationsStatus:ss};
  });

  const {picks,nearestAny}=await step('filter-and-rank',async()=>{
    const statusById=Object.create(null);for(const s of stationsStatus)statusById[String(s.station_id)]=s;
    const candidates=[];let nearestAny=null;
    for(const st of stationsInfo){
      const s=statusById[String(st.station_id)]; if(!s)continue;
      const bikes=getBikeCount(s); if(bikes<=0)continue;
      if(!rentingOKTolerant(s)&&bikes===0)continue;
      const dist=haversine(myLat,myLon,st.lat,st.lon);
      const rec={id:st.station_id,name:st.name,lat:st.lat,lon:st.lon,bikes,dist};
      if(!nearestAny||dist<nearestAny.dist)nearestAny=rec;
      if(dist<=maxMeters)candidates.push(rec);
    }
    candidates.sort((a,b)=>a.dist-b.dist);
    let picks=candidates.slice(0,3);
    if(picks.length===0){
      const all=stationsInfo.map(st=>{
        const s=statusById[String(st.station_id)]; if(!s)return null;
        const bikes=getBikeCount(s); if(bikes<=0)return null;
        const dist=haversine(myLat,myLon,st.lat,st.lon);
        return{id:st.station_id,name:st.name,lat:st.lat,lon:st.lon,bikes,dist};
      }).filter(Boolean).sort((a,b)=>a.dist-b.dist);
      picks=all.slice(0,3);
    }
    return{picks,nearestAny};
  });

  const n=new Notification(); const distFmt=m=>`${Math.round(m)}m`;
  if(picks.length){
    const line=picks.map(p=>`${SHOW_DISTANCES?`${p.name} · ${distFmt(p.dist)}`:p.name}: ${p.bikes}`).join(' | ');
    n.title='Bubi bikes'; n.body=line;
    const openURL=`maps://?daddr=${picks[0].lat},${picks[0].lon}&dirflg=w`;
    n.addAction('Navigate #1',openURL);
    if(picks[1])n.addAction('Navigate #2',`maps://?daddr=${picks[1].lat},${picks[1].lon}&dirflg=w`);
    if(picks[2])n.addAction('Navigate #3',`maps://?daddr=${picks[2].lat},${picks[2].lon}&dirflg=w`);
    n.openURL=openURL; Script.setShortcutOutput(line);
  }else{
    n.title='No bikes within radius';
    if(nearestAny){
      const name=SHOW_DISTANCES?`${nearestAny.name} · ${distFmt(nearestAny.dist)}`:nearestAny.name;
      const line=`${name}: ${nearestAny.bikes}`;
      n.body=line; const openURL=`maps://?daddr=${nearestAny.lat},${nearestAny.lon}&dirflg=w`;
      n.addAction('Navigate',openURL); n.openURL=openURL; Script.setShortcutOutput(line);
    }else{
      n.body='No bikes found'; Script.setShortcutOutput('No bikes found');
    }
  }
  await n.schedule(); Script.complete();
}catch(e){
  const msg=e&&e.message?e.message:String(e);
  const n=new Notification(); n.title='Bubi script error'; n.body=msg; await n.schedule();
  Script.setShortcutOutput(`Bubi script error: ${msg}`); Script.complete();
}})();
