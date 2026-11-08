/* Ozzy TV Cloudflare catalog loader. Embedded YouTube metadata only.
 * Preserve the existing 80-entry playback fallback if the API is empty,
 * unreachable or returns untrusted records. No secrets or wallet changes. */
(function (root) {
 "use strict";
 const DEFAULT_ENDPOINT='https://quantaphi-ozzy-catalog.marvaseater.workers.dev/api/ozzy/catalog';
 const URL_SOURCE=root.OZZY_CATALOG_ENDPOINT||DEFAULT_ENDPOINT;
 const REVIEWED_TARGET=1000;
 const catalog=Array.isArray(root.HERMIT_CATALOG)?root.HERMIT_CATALOG:[];
 const starter=catalog.slice();
 let pending=null;
 let lastSignature='';
 let lastFeedAt=0;
 root.OZZY_CATALOG_STATUS={source:'fallback',count:starter.length,target:REVIEWED_TARGET};
 root.OZZY_WEEKLY_ORDER=null;
 function officialSource(item){
  try{
   const u=new URL(item.sourceUrl);
   if(u.protocol!=='https:'||u.username||u.password)return false;
   return (['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)&&
    u.pathname==='/watch'&&u.searchParams.get('v')===item.videoId)||
    (u.hostname==='youtu.be'&&u.pathname==='/'+item.videoId);
  }catch{return false}
 }
 function valid(item){
  return item&&typeof item==='object'&&
   typeof item.videoId==='string'&&/^[a-zA-Z0-9_-]{11}$/.test(item.videoId)&&
   typeof item.artist==='string'&&item.artist.trim().length>=2&&item.artist.length<=120&&
   typeof item.songTitle==='string'&&item.songTitle.trim().length>=2&&item.songTitle.length<=160&&
   item.cleared===true&&officialSource(item);
 }
 function updateLabel(){
  if(typeof document==='undefined')return;
  const label=document.getElementById('catalogStatus');
  if(!label)return;
  const st=root.OZZY_CATALOG_STATUS;
  label.textContent=st.source==='cloudflare'
   ?st.count+' reviewed videos in Cloudflare rotation · goal '+st.target
   :st.count+' starter videos · Cloudflare updates pending';
 }
 function apply(feed){
  if(!feed||feed.ok!==true||!Array.isArray(feed.items)||
   !Number.isInteger(feed.count)||feed.count!==feed.items.length||
   feed.items.length<1||feed.items.length>3000)return false;
  if(!feed.items.every(valid))return false;
  const seen=new Set();
  const remote=[];
  for(const video of feed.items){
   if(seen.has(video.videoId))return false;
   seen.add(video.videoId);
   remote.push(Object.freeze({...video}));
  }
  let merged,cloudOrder=null;
  if(remote.length>=starter.length){
   merged=remote;
   const ids=Array.isArray(feed.weeklyIds)?feed.weeklyIds:[];
   if(/^\d{4}-\d{2}-\d{2}$/.test(String(feed.weekKey))&&
    ids.length===1008&&ids.every(id=>seen.has(id))){
    cloudOrder={weekKey:feed.weekKey,weeklyIds:ids.slice()};
   }
  }else{
   const existing=new Set(starter.map(p=>p.videoId));
   merged=starter.concat(remote.filter(p=>!existing.has(p.videoId)));
  }
  const sig=merged.map(p=>p.videoId+':'+p.songTitle).join('|')+';'+
   (cloudOrder?.weekKey||'')+':'+(cloudOrder?.weeklyIds?.join(',')||'');
  root.OZZY_CATALOG_STATUS={source:'cloudflare',count:merged.length,
   reviewedCount:remote.length,target:REVIEWED_TARGET,lastCheckedAt:Date.now()};
  lastFeedAt=Date.now();
  if(sig===lastSignature){updateLabel();return true}
  lastSignature=sig;
  // Update the original array in place: the player and guide retain this reference.
  catalog.splice(0,catalog.length,...merged);
  root.OZZY_WEEKLY_ORDER=cloudOrder;
  root.OZZY_CATALOG_REVISION=(root.OZZY_CATALOG_REVISION||0)+1;
  updateLabel();
  if(typeof root.dispatchEvent==='function'&&typeof CustomEvent!=='undefined')
   root.dispatchEvent(new CustomEvent('ozzy:catalog-updated',{detail:{
    count:merged.length,reviewedCount:remote.length,weekKey:cloudOrder?.weekKey||null
   }}));
  return true;
 }
 async function refresh(){
  if(pending)return pending;
  pending=(async()=>{
   try{
    const response=await fetch(URL_SOURCE,{cache:'no-store',credentials:'omit',
     signal:AbortSignal.timeout(9000)});
    if(!response.ok)throw Error('catalog unavailable');
    const feed=await response.json();
    if(!apply(feed))throw Error('catalog invalid');
    return true;
   }catch{
    if(!lastFeedAt)root.OZZY_CATALOG_STATUS={source:'fallback',count:catalog.length,target:REVIEWED_TARGET};
    updateLabel();return false;
   }finally{pending=null}
  })();
  return pending;
 }
 root.OzzyCloudCatalog={refresh,apply};
 updateLabel();
 void refresh();
 setInterval(()=>{if(typeof document==='undefined'||!document.hidden)void refresh()},20*60000);
 if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh()});
})(window);
