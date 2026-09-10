import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { recommend, trafficTrend } from '../server/recommendation.ts';
import { defaults, activeNow, validateSettings, settingsKey } from '../server/settings.ts';
import { parseSummary, TomTom, ProviderError } from '../server/tomtom.ts';
import { serializeDisplay } from '../server/display.ts';
import { Storage, type Database } from '../server/storage.ts';
import { commute } from '../server/service.ts';
import { handleApi } from '../server/api.ts';
import type { Prediction, Snapshot } from '../shared/types.ts';
const now=Date.parse('2026-09-09T14:30:00Z');
const s={...defaults(),origin:'Home',destination:'School',arriveBy:'2026-09-09T15:30:00Z'};
const point=(offset:number,minutes:number):Prediction=>({departure:new Date(now+offset*60000).toISOString(),minutes,delayMinutes:4});
const series=Array.from({length:10},(_,i)=>point(i*10,20));
function db():Database {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../drizzle/0000_absurd_menace.sql',import.meta.url),'utf8'));
  return { prepare(sql:string) {
    const st=sqlite.prepare(sql);
    return { bind(...args:unknown[]) {
      return {
        async first() { return st.get(...(args as string[])) || null; },
        async run() { const r=st.run(...(args as string[])); return {meta:{changes:Number(r.changes)}}; }
      };
    }};
  }} as Database;
}
test('latest safe departure has one-minute precision',()=>assert.equal(recommend(s,series,series[0],now).leaveBy,'2026-09-09T15:05:00.000Z'));
test('parking/walking allowance reduces departure',()=>assert.equal(recommend({...s,parkingWalkingMinutes:7},series,series[0],now).leaveBy,'2026-09-09T14:58:00.000Z'));
test('safety buffer is included',()=>assert.equal(recommend({...s,safetyBufferMinutes:12},series,series[0],now).leaveBy,'2026-09-09T14:58:00.000Z'));
test('no feasible departure is explicit',()=>{const r=recommend({...s,arriveBy:point(10,1).departure},series,series[0],now);assert.equal(r.feasible,false);assert.equal(r.leaveBy,null);assert.match(r.message,/Leave now/);});
for(const [name,minutes] of [['improving',16],['stable',22],['worsening',24]] as const) test(name+' traffic',()=>assert.equal(trafficTrend([point(0,20),point(10,minutes)],s.timezone).trend,name));
test('nonmonotonic traffic checks all candidates',()=>{const r=recommend({...s,safetyBufferMinutes:0},[point(0,20),point(10,60),point(40,10),point(50,10)],point(0,20),now);assert.equal(r.leaveBy,point(50,1).departure);});
test('does not interpolate an unsampled overnight gap',()=>{const r=recommend({...s,arriveBy:point(300,1).departure},[point(0,20),point(1440,20)],point(0,20),now);assert.equal(r.leaveBy,point(0,1).departure);});
test('reject malformed prediction series',()=>{assert.throws(()=>recommend(s,[],point(0,20),now));assert.throws(()=>recommend(s,[point(0,NaN)],point(0,20),now));});
test('missing and malformed TomTom summaries',()=>{for(const input of [null,{}, {routes:[]},{routes:[{summary:{travelTimeInSeconds:0}}]}])assert.throws(()=>parseSummary(input));});
test('valid summary preserves traffic fields',()=>assert.equal(parseSummary({routes:[{summary:{travelTimeInSeconds:1200,lengthInMeters:1000,arrivalTime:s.arriveBy,departureTime:point(0,1).departure}}]}).travelTimeInSeconds,1200));
test('settings validation and overnight active window',()=>{assert.throws(()=>validateSettings({...s,brightness:NaN}));assert.throws(()=>validateSettings({...s,rotateScreens:'yes'}));assert.equal(activeNow({...s,activeStart:'23:00',activeEnd:'02:00',activeWeekdays:[2]},Date.parse('2026-09-09T08:00:00Z')),true);});
test('display serialization is compact, timezone aware and secret-free',()=>{const snap:Snapshot={settingsKey:settingsKey(s),current:series[0],predictions:series,updatedAt:point(0,1).departure,predictionsAt:point(0,1).departure,recommendation:recommend(s,series,series[0],now)};const result=serializeDisplay(s,snap,now);assert.equal(result.utcOffsetSeconds,-25200);assert.equal(result.display.leaveTime,'8:05 AM');assert.ok(JSON.stringify(result).length<6000);assert.ok(!JSON.stringify(result).includes('settingsKey'));assert.equal(JSON.parse(JSON.stringify(result)).status,'ok');});
test('database lease prevents overlapping refresh across storage instances',async()=>{const database=db(),a=new Storage(database),b=new Storage(database);const owner=await a.acquire('refresh',now);assert.ok(owner);assert.equal(await b.acquire('refresh',now),null);await a.release('refresh',owner!);assert.ok(await b.acquire('refresh',now));});
test('service caches series/current, persists and falls back on failure',async()=>{
  const storage=new Storage(db());await storage.set('settings',s);let calls=0,fail=false;
  const fetcher=(async (input:URL|RequestInfo)=>{calls++;if(fail)throw Error('secret must not escape');const url=new URL(String(input));
    if(url.pathname.includes('geocode'))return Response.json({results:[{position:{lat:37,lon:-122},address:{freeformAddress:'Address'}}]});
    const t=url.searchParams.get('departAt'),arr=url.searchParams.get('arriveAt');const departure=arr?Date.parse(arr)-20*60000:t&&t!=='now'?Date.parse(t):now;
    return Response.json({routes:[{summary:{departureTime:new Date(departure).toISOString(),arrivalTime:new Date(departure+20*60000).toISOString(),travelTimeInSeconds:1200,noTrafficTravelTimeInSeconds:1000,lengthInMeters:15000}}]});
  }) as typeof fetch;
  const provider=new TomTom('TEST_ONLY_KEY',storage,fetcher);
  assert.equal((await commute(s,storage,provider,now)).status,'ok');const first=calls;
  await commute(s,storage,provider,now+30000);assert.equal(calls,first);
  await commute(s,storage,provider,now+300000);assert.equal(calls,first+1);
  fail=true;const offline=await commute(s,storage,provider,now+600000);assert.equal(offline.status,'cached');assert.ok(offline.recommendation);assert.ok(!JSON.stringify(offline).includes('secret'));
});
test('TomTom transport errors never expose provider keys',async()=>{const provider=new TomTom('PRIVATE_KEY',new Storage(db()),async()=>{throw Error('PRIVATE_KEY');});await assert.rejects(()=>provider.json(new URL('https://api.tomtom.com')),e=>e instanceof ProviderError&&!e.message.includes('PRIVATE_KEY'));});
test('provider does not bind native fetch to its class instance',async()=>{
  const fetcher=async function(this:unknown) { assert.equal(this,undefined);return Response.json({ok:true}); };
  const provider=new TomTom('TEST_ONLY_KEY',new Storage(db()),fetcher);
  assert.deepEqual(await provider.json(new URL('https://api.tomtom.com')),{ok:true});
});
test('API separates admin/display access and validates method/body',async()=>{
  const env={DB:db(),ADMIN_TOKEN:'admin',DISPLAY_TOKEN:'display'};
  assert.equal((await handleApi(new Request('https://commute.test/api/settings'),env)).status,401);
  assert.equal((await handleApi(new Request('https://commute.test/api/settings',{headers:{Authorization:'Bearer display'}}),env)).status,401);
  const r=await handleApi(new Request('https://commute.test/api/display',{headers:{Authorization:'Bearer display'}}),env);assert.equal(r.status,200);assert.equal((await r.json()).status,'missing_configuration');
  assert.equal((await handleApi(new Request('https://commute.test/api/settings',{method:'PUT',headers:{Authorization:'Bearer admin','Content-Type':'application/json'},body:'null'}),env)).status,400);
  assert.equal((await handleApi(new Request('https://commute.test/api/display',{method:'POST',headers:{Authorization:'Bearer display'}}),env)).status,405);
});
