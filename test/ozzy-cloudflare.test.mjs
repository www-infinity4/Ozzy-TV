import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeVideo, buildWeeklyRotation, getCatalogResponse, refreshReviewedManifest, discoverOfficialVideoCandidates, default as worker} from '../workers/ozzy-catalog/worker.mjs';
const video=(i)=>({videoId:'A'+String(i).padStart(10,'0'),artist:'Ozzy artist '+i,songTitle:'Rock track '+i,sourceUrl:'https://www.youtube.com/watch?v=A'+String(i).padStart(10,'0'),reviewedAt:Date.UTC(2026,10,7),embedApproved:true,reviewSource:'QuantaPhi approved source catalog'});
const epoch=Date.UTC(2026,10,7,12);
test('reviewed YouTube music videos normalize and unreviewed, forged or invalid clips fail closed',()=>{
 assert.equal(normalizeVideo(video(1),epoch)?.videoId,video(1).videoId);
 assert.equal(normalizeVideo({...video(1),embedApproved:false},epoch),null);
 assert.equal(normalizeVideo({...video(1),sourceUrl:'https://youtube.evil.example/watch?v='+video(1).videoId},epoch),null);
 assert.equal(normalizeVideo({...video(1),videoId:'javascript:1'},epoch),null);
 assert.equal(normalizeVideo({...video(1),reviewedAt:Date.UTC(2021,1,1)},epoch),null);
 assert.equal(normalizeVideo({...video(1),reviewSource:''},epoch),null);
});
test('one central 1008-slot week is deterministic and uses 1000 items before its first repeat',()=>{
 const entries=Array.from({length:1000},(_,i)=>normalizeVideo(video(i),epoch));
 const first=buildWeeklyRotation(entries,'2026-11-01');
 const second=buildWeeklyRotation(entries,'2026-11-01');
 assert.equal(first.length,1008);
 assert.deepEqual(first,second);
 assert.equal(new Set(first.slice(0,1000)).size,1000);
 assert.equal(new Set(first).size,1000);
 assert.notDeepEqual(first,buildWeeklyRotation(entries,'2026-11-08'));
});
test('small pool uses every item before repeating and avoids duplicate cycle boundary',()=>{
 const ids=Array.from({length:80},(_,i)=>normalizeVideo(video(i),epoch));
 const order=buildWeeklyRotation(ids,'2026-11-01');
 assert.equal(new Set(order.slice(0,80)).size,80);
 for(let n=80;n<order.length;n+=80)assert.notEqual(order[n],order[n-1]);
});
test('D1 reads only recent reviewed approved items and never invents 1000 records',async()=>{
 const db={prepare(sql){return {bind(){return {async all(){return {results:[{...video(1),review_status:'approved',embed_approved:1}]}}}}}}};
 const response=await getCatalogResponse({DB:db},epoch);
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.count,1);
 assert.equal(data.items[0].videoId,video(1).videoId);
 assert.equal(data.weeklyIds.length,1008);
 assert.equal(data.targetCount,1000);
});
test('unavailable D1 returns a clear fallback error, not fake records',async()=>{
 const r=await worker.fetch(new Request('https://quantaphi.org/api/ozzy/catalog'),{});
 assert.equal(r.status,503);
 assert.equal((await r.json()).count,0);
});
test('automated imports require explicit approved manifest and never accept arbitrary hosts',async()=>{
 let writes=0;
 const d={prepare(){writes++;throw Error('not expected')}};
 const fail=await refreshReviewedManifest({DB:d},epoch,async()=>({ok:true,status:200,text:async()=>JSON.stringify({items:[video(1)]}),headers:new Headers()}));
 assert.equal(fail.ok,false);assert.equal(writes,0);
 const good=await refreshReviewedManifest({DB:d,OZZY_REVIEWED_MANIFEST_URL:'https://wrong.example/approved-videos.json'},epoch);
 assert.equal(good.ok,false);assert.equal(writes,0);
});
test('reviewed repo manifest imports valid, deduplicated rows into D1 with explicit review date',async()=>{
 const updates=[];
 const db={prepare(sql){return {bind(...args){return {sql,args}}}},async batch(q){updates.push(...q);return q.map(()=>({success:true}))}};
 const env={DB:db,OZZY_REVIEWED_MANIFEST_URL:'https://raw.githubusercontent.com/www-infinity4/Ozzy-TV/main/data/approved-videos.json'};
 const r=await refreshReviewedManifest(env,epoch,async(_url,options)=>{
  assert.equal(options.redirect,'error');
  return {ok:true,status:200,text:async()=>JSON.stringify({items:[video(1),video(1),video(2)]}),headers:new Headers()};
 });
 assert.equal(r.ok,true);assert.equal(r.count,2);
 assert.equal(updates.filter(x=>/INSERT INTO ozzy_videos/.test(x.sql)).length,2);
 assert.ok(updates.some(x=>/ozzy_catalog_refresh/.test(x.sql)));
});
test('API only returns public YouTube metadata and no third-party copyrighted media bytes',async()=>{
 const s=await worker.fetch(new Request('https://quantaphi.org/video.mp4'),{});
 assert.equal(s.status,404);
 assert.equal((await s.json()).error,'not_found');
});
test('official YouTube RSS sources add new songs to a pending-only D1 discovery queue',async()=>{
 const videoId='abcDEFG1234';
 const atom='<?xml version="1.0"?><feed><entry><yt:videoId>'+videoId+'</yt:videoId><title>Ozzy Osbourne - New music video</title><published>2026-11-06T00:00:00Z</published></entry></feed>';
 const rows=[];
 const db={prepare(sql){return {bind(...params){return {sql,params}}}},async batch(q){rows.push(...q);return q.map(()=>({success:true}))}};
 const r=await discoverOfficialVideoCandidates({DB:db},epoch,async(url,opts)=>{
  assert.ok(url.startsWith('https://www.youtube.com/feeds/videos.xml?channel_id='));
  assert.equal(opts.redirect,'error');
  return {ok:true,status:200,headers:new Headers(),text:async()=>atom};
 });
 assert.equal(r.ok,true);
 assert.ok(r.discovered>=1);
 assert.ok(rows.some(x=>/INSERT OR IGNORE INTO ozzy_candidates/.test(x.sql)));
 assert.ok(rows.some(x=>x.sql.includes("'pending'")));
 assert.ok(!rows.some(x=>/INSERT INTO ozzy_videos/.test(x.sql)));
});
test('RSS search failures cannot promote or erase existing broadcast records',async()=>{
 const statements=[];
 const db={prepare(sql){return {bind(...args){return {sql,args}}}},async batch(queries){statements.push(...queries);return queries.map(()=>({success:true}))}};
 const r=await discoverOfficialVideoCandidates({DB:db},epoch,async()=>({ok:false,status:503}));
 assert.equal(r.ok,false);
 assert.ok(statements.some(q=>q.sql.includes('ozzy_feed_checks')));
 assert.ok(statements.every(q=>!q.sql.includes('ozzy_videos')));
});

test('reviewed catalog can PROMOTE an existing legacy song without a D1 primary-key collision',async()=>{
 const queries=[];
 const db={prepare(sql){return {bind(...args){return {sql,args}}}},async batch(q){queries.push(...q);return q.map(()=>({success:true}))}};
 const env={DB:db,OZZY_REVIEWED_MANIFEST_URL:'https://raw.githubusercontent.com/www-infinity4/Ozzy-TV/main/data/approved-videos.json'};
 const r=await refreshReviewedManifest(env,epoch,async()=>({
  ok:true,status:200,headers:new Headers(),
  text:async()=>JSON.stringify({items:[video(1)]})
 }));
 assert.equal(r.ok,true);
 const q=queries.find(x=>/INSERT INTO ozzy_videos/.test(x.sql));
 assert.ok(q);
 assert.match(q.sql,/ON CONFLICT\s*\(video_id\)\s*DO UPDATE/i,
  'legacy video IDs must be upserted to avoid aborting the D1 batch');
 assert.match(q.sql,/review_status\s*=\s*excluded\.review_status/i);
});

test('official feeds track 404 outages without touching published music',async()=>{
 const writes=[];
 const db={prepare(sql){return {bind(...args){return {sql,args}}}},async batch(q){writes.push(...q);return q.map(()=>({success:true}))}};
 const r=await discoverOfficialVideoCandidates({DB:db},epoch,async()=>({
  ok:false,status:404,headers:new Headers()
 }));
 assert.equal(r.ok,false);
 assert.equal(r.error,'official_feeds_unavailable');
 assert.ok(writes.some(q=>/ozzy_feed_checks/i.test(q.sql)),
  'record 404 diagnosis in isolated Cloudflare D1 health table');
 assert.ok(writes.every(q=>!/ozzy_videos/i.test(q.sql)),
  'never modify playback pool from a failed RSS fetch');
});

test('read-only discovery status endpoint discloses feed health without exposing secrets or editing songs',async()=>{
 const fake={
  prepare(sql){
   return {bind(){return {
    async first(){return {videos:80,approved:0,candidates:2}},
    async all(){return {results:[{artist:'Ozzy Osbourne',checkedAt:epoch,statusCode:404,entryCount:0,error:'http_404'}]}}
   }}};
  }
 };
 const reply=await worker.fetch(new Request('https://quantaphi.org/api/ozzy/discovery-status'),{DB:fake});
 assert.equal(reply.status,200);
 const payload=await reply.json();
 assert.equal(payload.legacyAndReviewed,80);
 assert.equal(payload.approved,0);
 assert.equal(payload.candidates,2);
 assert.equal(payload.feeds[0].statusCode,404);
 assert.ok(!JSON.stringify(payload).includes('token'));
});