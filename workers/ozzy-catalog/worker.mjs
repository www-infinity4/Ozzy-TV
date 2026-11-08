// Ozzy TV read-only public YouTube embed catalog + reviewed-GitHub-manifest importer.
// No copyrighted audio/video files are stored or streamed by this Worker.
// Metadata and approved player embed eligibility are NOT rights to redistribute music.
const TIME_ZONE='America/Chicago';
const WEEK_SLOTS=1008;
const MAX_ITEMS=3000;
const MAX_MANIFEST_SIZE=2000000;
const SOURCE_URL='https://raw.githubusercontent.com/www-infinity4/Ozzy-TV/main/data/approved-videos.json';
const MAX_REVIEW_AGE=120*86400000;
const YEAR=2026;
const HEADERS={'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};
const ORIGINS=new Set(['https://quantaphi.org','https://www.quantaphi.org','https://www-infinity4.github.io']);
const trimmed=(v,n)=>typeof v==='string'?v.replace(/\s+/g,' ').trim().slice(0,n):'';
const isYTId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{11}$/.test(s);
function validSource(link,id){
 try{
  const u=new URL(String(link||''));
  if(u.protocol!=='https:'||u.username||u.password)return false;
  if(['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)){
   return u.pathname==='/watch'&&u.searchParams.get('v')===id;
  }
  return u.hostname==='youtu.be'&&u.pathname==='/'+id;
 }catch{return false}
}
export function normalizeVideo(raw,now=Date.now()){
 if(!raw||typeof raw!=='object')return null;
 const id=trimmed(raw.videoId||raw.video_id,20);
 const artist=trimmed(raw.artist,120);
 const songTitle=trimmed(raw.songTitle||raw.song_title,160);
 const reviewedAt=Number(raw.reviewedAt??raw.reviewed_at);
 const sourceUrl=raw.sourceUrl||raw.source_url;
 const reviewSource=trimmed(raw.reviewSource||raw.review_source,200);
 const embedApproved=raw.embedApproved===true||raw.embed_approved===1;
 if(!isYTId(id)||artist.length<2||songTitle.length<2||
  !validSource(sourceUrl,id)||!reviewSource||
  !embedApproved||!Number.isFinite(reviewedAt)||
  reviewedAt>now||now-reviewedAt>MAX_REVIEW_AGE)return null;
 return {
  videoId:id,id:'OZZY-D1-'+id,artist,songTitle,title:artist+' — '+songTitle,
  year:null,collection:'Rock / Heavy Metal Music Video',
  networkChannel:'OZZY-TV',contentClass:'Music Video',rating:'Music',
  cleared:true, // legacy app flag: embeddable source; not copyright clearance
  posterUrl:'',sourceUrl:new URL(sourceUrl).href,
  reviewedAt,reviewSource
 };
}
function hash(text){
 let h=2166136261;
 for(const char of text)h=Math.imul(h^char.charCodeAt(0),16777619);
 return h>>>0;
}
function shuffled(ids,salt){
 const a=ids.slice();
 let x=hash(salt);
 function rand(){
  x+=0x6D2B79F5;
  let t=x;
  t=Math.imul(t^(t>>>15),t|1);
  t^=t+Math.imul(t^(t>>>7),t|61);
  return ((t^(t>>>14))>>>0)/4294967296;
 }
 for(let i=a.length-1;i>0;i--){
  const j=Math.floor(rand()*(i+1));
  [a[i],a[j]]=[a[j],a[i]];
 }
 return a;
}
export function buildWeeklyRotation(videos,weekKey){
 const ids=Array.from(new Set((videos||[]).map(v=>v&&v.videoId).filter(isYTId))).sort();
 if(!ids.length)return [];
 const order=[];
 for(let pass=0;order.length<WEEK_SLOTS;pass++){
  const batch=shuffled(ids,'ozzy-cloudflare:'+weekKey+':'+pass);
  if(order.length&&batch.length>1&&batch[0]===order[order.length-1]){
   const j=batch.findIndex((id,i)=>i>0&&id!==order[order.length-1]);
   if(j>0)[batch[0],batch[j]]=[batch[j],batch[0]];
  }
  order.push(...batch.slice(0,WEEK_SLOTS-order.length));
 }
 return order;
}
export function weekKeyInChicago(at=Date.now()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(new Date(at)).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
 const sunday=new Date(Date.UTC(p.year,p.month-1,p.day));
 sunday.setUTCDate(sunday.getUTCDate()-sunday.getUTCDay());
 return sunday.toISOString().slice(0,10);
}
function json(body,status=200,origin=''){
 const headers={...HEADERS};
 if(ORIGINS.has(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Vary']='Origin'}
 return new Response(JSON.stringify(body),{status,headers});
}
export async function getCatalogResponse(env,now=Date.now(),origin=''){
 if(!env?.DB)return json({ok:false,error:'ozzy_database_unavailable',count:0,items:[]},503,origin);
 try{
  const result=await env.DB.prepare(
   "SELECT video_id AS videoId,artist,song_title AS songTitle,source_url AS sourceUrl,reviewed_at AS reviewedAt,review_source AS reviewSource,embed_approved,review_status FROM ozzy_videos WHERE review_status='approved' AND embed_approved=1 AND reviewed_at>=? ORDER BY video_id LIMIT 3000"
  ).bind(now-MAX_REVIEW_AGE).all();
  const seen=new Set(),items=[];
  for(const raw of (result?.results||[]).slice(0,MAX_ITEMS)){
   if(raw.review_status!=='approved'&&raw.review_status!==undefined)continue;
   const item=normalizeVideo(raw,now);
   if(!item||seen.has(item.videoId))continue;
   seen.add(item.videoId);items.push(item);
  }
  if(!items.length)return json({ok:false,error:'no_reviewed_playable_videos',count:0,items:[]},503,origin);
  const weekKey=weekKeyInChicago(now);
  const playlist=buildWeeklyRotation(items,weekKey);
  const res=json({ok:true,channel:'OZZY-TV',weekKey,count:items.length,targetCount:1000,
   source:'reviewed QuantaPhi channel manifest / Cloudflare D1',
   items,weeklyIds:playlist,generatedAt:now},200,origin);
  res.headers.set('Cache-Control','public, max-age=120, s-maxage=120');
  return res;
 }catch{
  return json({ok:false,error:'ozzy_catalog_read_failed',count:0,items:[]},503,origin);
 }
}
const validManifestUrl=env=>env?.OZZY_REVIEWED_MANIFEST_URL===SOURCE_URL;
export async function refreshReviewedManifest(env,now=Date.now(),fetcher=fetch){
 if(!env?.DB||!validManifestUrl(env))return {ok:false,error:'reviewed_manifest_not_configured'};
 try{
  const response=await fetcher(SOURCE_URL,{method:'GET',redirect:'error',cache:'no-store',
   headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
  if(!response.ok||response.status!==200)return {ok:false,error:'manifest_http_unavailable'};
  if(Number(response.headers?.get?.('content-length')||0)>MAX_MANIFEST_SIZE)
   return {ok:false,error:'manifest_too_large'};
  const body=await response.text();
  if(body.length>MAX_MANIFEST_SIZE)return {ok:false,error:'manifest_too_large'};
  const data=JSON.parse(body);
  if(!data||!Array.isArray(data.items)||data.items.length>MAX_ITEMS)
   return {ok:false,error:'manifest_schema_invalid'};
  const ids=new Set(),items=[];
  for(const raw of data.items){
   const p=normalizeVideo(raw,now);
   if(!p||ids.has(p.videoId))continue;
   items.push(p);ids.add(p.videoId);
  }
  if(data.items.length>0&&items.length===0)return {ok:false,error:'no_reviewed_items'};
  const queries=[env.DB.prepare("DELETE FROM ozzy_videos WHERE import_source='github-reviewed-manifest'").bind()];
  for(const p of items){
   queries.push(env.DB.prepare(
    "INSERT INTO ozzy_videos (video_id, artist, song_title, source_url, reviewed_at, review_source, embed_approved, review_status, import_source, imported_at) VALUES (?1,?2,?3,?4,?5,?6,1,'approved','github-reviewed-manifest',?7)"
   ).bind(p.videoId,p.artist,p.songTitle,p.sourceUrl,p.reviewedAt,p.reviewSource,now));
  }
  queries.push(env.DB.prepare(
   "INSERT INTO ozzy_catalog_refresh (id, refreshed_at, approved_count) VALUES (1,?1,?2) ON CONFLICT(id) DO UPDATE SET refreshed_at=excluded.refreshed_at,approved_count=excluded.approved_count"
  ).bind(now,items.length));
  await env.DB.batch(queries);
  return {ok:true,count:items.length,refreshedAt:now};
 }catch{
  return {ok:false,error:'reviewed_manifest_refresh_failed'};
 }
}
// Approved artist-channel IDs; their RSS uploads are DISCOVERY CANDIDATES only.
// This never grants broadcast permission or marks YouTube embedding as playable.
const OFFICIAL_CHANNELS=[
 {id:'UCe3JCin4Gnv9azlWnAs5keg',artist:'Ozzy Osbourne'},
 {id:'UCrx-X329UKv0Y06VhfpFVvw',artist:'Black Sabbath'},
 {id:'UCbulh9WdLtEXiooRcYK7SWw',artist:'Metallica'},
 {id:'UCaisXKBdNOYqGr2qOXCLchQ',artist:'Iron Maiden'}
];
function xmlTitle(source){
 const raw=String(source||'').replace(/<[^>]+>/g,'');
 return raw.replace(/&amp;/g,'&').replace(/&quot;/g,'"')
  .replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim().slice(0,200);
}
export async function discoverOfficialVideoCandidates(env,now=Date.now(),fetcher=fetch){
 if(!env?.DB)return {ok:false,error:'database_not_configured'};
 const found=new Map();
 let success=0;
 // Only fixed public official artist channels, never user-provided arbitrary URLs.
 const fetched=await Promise.all(OFFICIAL_CHANNELS.map(async channel=>{
  try{
   const url='https://www.youtube.com/feeds/videos.xml?channel_id='+channel.id;
   const response=await fetcher(url,{
    method:'GET',redirect:'error',cache:'no-store',
    headers:{Accept:'application/atom+xml,application/xml'},
    signal:AbortSignal.timeout(10000)
   });
   if(!response.ok||response.status!==200||
    Number(response.headers?.get?.('content-length')||0)>256000)return null;
   const xml=await response.text();
   if(xml.length>256000)return null;
   return {channel,xml};
  }catch{return null}
 }));
 for(const result of fetched){
  if(!result)continue;
  success++;
  const entries=result.xml.match(/<entry\b[^>]*>[\s\S]*?<\/entry>/g)||[];
  for(const entry of entries.slice(0,15)){
   const id=entry.match(/<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/)?.[1];
   const rawTitle=entry.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/)?.[1]||'';
   const title=xmlTitle(rawTitle);
   const published=Date.parse(entry.match(/<published>([^<]+)<\/published>/)?.[1]||'');
   if(!isYTId(id)||title.length<3||!Number.isFinite(published)||published>now+86400000)continue;
   if(!found.has(id))found.set(id,{
    videoId:id,artist:result.channel.artist,title,channelId:result.channel.id,
    publishedAt:published
   });
  }
 }
 if(!success)return {ok:false,error:'official_feeds_unavailable',discovered:0};
 const queries=[];
 for(const p of found.values()){
  queries.push(env.DB.prepare(
   "INSERT OR IGNORE INTO ozzy_candidates (video_id, artist, video_title, channel_id, source_url, published_at, discovered_at, review_status) VALUES (?1,?2,?3,?4,?5,?6,?7,'pending')"
  ).bind(p.videoId,p.artist,p.title,p.channelId,
   'https://www.youtube.com/watch?v='+p.videoId,p.publishedAt,now));
 }
 try{
  if(queries.length)await env.DB.batch(queries);
  return {ok:true,discovered:found.size,officialFeeds:success,reviewStatus:'pending'};
 }catch{return {ok:false,error:'candidate_queue_write_failed',discovered:0}}
}

export default {
 async fetch(request,env){
  const u=new URL(request.url);
  if(u.pathname==='/api/ozzy/health'){
   return json({ok:true,service:'ozzy-catalog',hasDatabase:!!env.DB},200,request.headers.get('origin')||'');
  }
  if(u.pathname!=='/api/ozzy/catalog')return json({ok:false,error:'not_found'},404);
  if(!['GET','HEAD'].includes(request.method))return json({ok:false,error:'method_not_allowed'},405);
  const result=await getCatalogResponse(env,Date.now(),request.headers.get('origin')||'');
  if(request.method==='HEAD')return new Response(null,{status:result.status,headers:result.headers});
  return result;
 },
 async scheduled(_event,env,ctx){
  ctx.waitUntil(Promise.all([
   refreshReviewedManifest(env),
   discoverOfficialVideoCandidates(env)
  ]).then(([approved,candidates])=>{
   if(!approved.ok)console.warn('ozzy_reviewed_catalog_refresh',approved.error);
   if(!candidates.ok)console.warn('ozzy_official_candidate_refresh',candidates.error);
  }));
 }
};
