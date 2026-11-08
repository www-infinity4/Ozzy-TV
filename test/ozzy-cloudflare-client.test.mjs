import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=readFileSync(new URL('../cloudflare-catalog.js',import.meta.url),'utf8');
const engine=readFileSync(new URL('../engine.js',import.meta.url),'utf8');
const base=Array.from({length:80},(_,i)=>({videoId:'A'+String(i).padStart(10,'0'),artist:'Legacy '+i,songTitle:'Track '+i,title:'Legacy '+i,cleared:true}));
const item=(n)=>({videoId:'Z'+String(n).padStart(10,'0'),artist:'Cloud reviewed '+n,songTitle:'Verified '+n,title:'Cloud reviewed '+n+' — Verified '+n,cleared:true,sourceUrl:'https://www.youtube.com/watch?v=Z'+String(n).padStart(10,'0')});
function harness(payload){
 const window={HERMIT_CATALOG:base.map(x=>({...x})),listeners:{},addEventListener(n,fn){this.listeners[n]=fn},dispatchEvent(e){this.event=e;this.listeners[e.type]?.(e)}};
 const context={window,Date,console,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}},
  setInterval(){return 1},setTimeout(){return 1},fetch:async()=>({ok:true,json:async()=>payload}),AbortSignal,URL};
 vm.runInNewContext(script,context);
 return {window,context};
}
test('Cloudflare client merges new approved videos with starter fallback without losing the 80 legacy songs',async()=>{
 const week='2026-11-01';
 const p={ok:true,count:1,items:[item(1)],weekKey:week,weeklyIds:Array(1008).fill(item(1).videoId)};
 const {window}=harness(p);
 await window.OzzyCloudCatalog.refresh();
 assert.equal(window.HERMIT_CATALOG.length,81);
 assert.equal(window.HERMIT_CATALOG[80].videoId,item(1).videoId);
 assert.equal(window.OZZY_WEEKLY_ORDER,null);
});
test('larger Cloudflare catalog uses stable cloud weekly picks and live pool reference',async()=>{
 const items=Array.from({length:1000},(_,i)=>item(i));
 const payload={ok:true,count:1000,items,weekKey:'2026-11-01',weeklyIds:[...items.map(x=>x.videoId),...items.slice(0,8).map(x=>x.videoId)]};
 const {window}=harness(payload),original=window.HERMIT_CATALOG;
 await window.OzzyCloudCatalog.refresh();
 assert.equal(window.HERMIT_CATALOG,original);
 assert.equal(original.length,1000);
 assert.equal(window.OZZY_WEEKLY_ORDER.weeklyIds.length,1008);
});
test('rejects any malformed or forged catalog without replacing existing playback',async()=>{
 const {window}=harness({ok:true,count:1,items:[{...item(1),videoId:'../unsafe'}],weeklyIds:[],weekKey:'2026-11-01'});
 await window.OzzyCloudCatalog.refresh();
 assert.equal(window.HERMIT_CATALOG.length,80);
 assert.equal(window.OZZY_CATALOG_STATUS.source,'fallback');
});
test('engine station timezone is fixed in Central, not the viewers local timezone',()=>{
 const root={};
 vm.runInNewContext(engine,{window:root,Intl,Date,Math,Number,Array,Object,String});
 assert.equal(root.HermitEngine.TIME_ZONE,'America/Chicago');
});
test('engine honors verified cloud 1008-slot permutation, and rejects unknown sources',()=>{
 const items=Array.from({length:1000},(_,i)=>item(i));
 const now=Date.UTC(2026,10,7,23,0,0);
 const root={OZZY_WEEKLY_ORDER:{weekKey:'2026-11-01',weeklyIds:[...items.map(x=>x.videoId),...items.slice(0,8).map(x=>x.videoId)]}};
 vm.runInNewContext(engine,{window:root,Intl,Date,Math,Number,Array,Object,String});
 const result=root.HermitEngine.makeWeekRotation(now,items);
 assert.equal(result.length,1008);
 assert.equal(result[0].videoId,item(0).videoId);
 root.OZZY_WEEKLY_ORDER.weeklyIds[5]='not-valid';
 const next=root.HermitEngine.makeWeekRotation(now,items);
 assert.equal(next.length,1008);
 assert.notEqual(next[5]?.videoId,'not-valid');
});
test('one video embed failure must not alter every viewer station schedule on the next day',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const scheduleBlock=app.match(/function ensureSchedule\(nowMs\)\s*\{[\s\S]*?renderGuide\(nowMs\);\s*\}/)?.[0]||'';
 assert.ok(scheduleBlock.includes('engine.createDaySchedule(nowMs, catalog)'),
  'the canonical station schedule always uses the same complete catalog');
 assert.ok(!scheduleBlock.includes('catalog.filter(item => !failedVideoIds.has(item.videoId))'),
  'failed video IDs must be substituted locally rather than shrinking the global schedule');
});

test('catalog count must distinguish reviewed Cloudflare videos from unverified legacy fallbacks',async()=>{
 const {window}=harness({ok:true,count:1,items:[item(1)],weekKey:'2026-11-01',weeklyIds:[]});
 await window.OzzyCloudCatalog.refresh();
 const status=window.OzzyCloudCatalog.statusText(window.OZZY_CATALOG_STATUS);
 assert.match(status,/1 reviewed/);
 assert.match(status,/80 legacy/);
 assert.doesNotMatch(status,/81 reviewed/);
});
