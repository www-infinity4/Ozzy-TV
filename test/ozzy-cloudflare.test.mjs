import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeVideo, buildWeeklyRotation, getCatalogResponse, refreshReviewedManifest, default as worker} from '../workers/ozzy-catalog/worker.mjs';
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