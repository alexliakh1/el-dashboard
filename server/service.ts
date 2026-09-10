import type { Settings, Snapshot, Prediction } from '../shared/types.ts';
import { Storage } from './storage.ts';
import { activeNow, settingsKey } from './settings.ts';
import { recommend } from './recommendation.ts';
import { TomTom, prediction, ProviderError } from './tomtom.ts';
import { serializeDisplay } from './display.ts';
export async function commute(s:Settings, storage:Storage, provider:TomTom, now=Date.now(), force=false) {
  if (!s.origin || !s.destination || !s.arriveBy) return serializeDisplay(s,null,now,'missing_configuration','Save your route and arrival time to begin.');
  const key=settingsKey(s), saved=await storage.get<Snapshot>('snapshot');
  const old=saved?.settingsKey===key?saved:null;
  if (Date.parse(s.arriveBy)<=now) return serializeDisplay(s,old,now,'no_route','Arrival time has passed. Choose the next commute date.');
  const active=activeNow(s,now), currentTtl=active?300000:3600000, seriesTtl=active?900000:3600000;
  const retry=await storage.get<{until:number;kind:string;message:string}>('retry');
  if (retry && retry.until>now) return serializeDisplay(s,old,now,old?'cached':retry.kind,retry.message);
  const currentDue=!old || now-Date.parse(old.updatedAt)>=currentTtl || (force && now-Date.parse(old.updatedAt)>=60000);
  if (!currentDue) return serializeDisplay(s,old,now);
  const owner=await storage.acquire('refresh',now);
  if (!owner) return serializeDisplay(s,old,now,old?'cached':'loading','Refreshing commute.');
  try {
    const [origin,destination]=await Promise.all([provider.geocode(s.origin),provider.geocode(s.destination)]);
    const current=prediction(await provider.route(origin,destination,'now'),new Date(now).toISOString());
    let predictions:Prediction[]=old?.predictions || [], predictionsAt=old?.predictionsAt || '';
    if (!old || now-Date.parse(old.predictionsAt)>=seriesTtl) {
      // Keep the next 90 minutes for the graph. For future trips add a window
      // around TomTom's arrive-by seed, so tomorrow's commute is sampled too.
      const deadline=Date.parse(s.arriveBy)-(s.safetyBufferMinutes+s.parkingWalkingMinutes)*60000;
      let seed=now;
      if (deadline>now) seed=Date.parse((await provider.route(origin,destination,new Date(deadline).toISOString(),'arriveAt')).departureTime);
      const times=new Set<number>();
      for(let i=10;i<=90;i+=10) times.add(Math.ceil((now+i*60000)/60000)*60000);
      if(seed>now+80*60000) for(let t=seed-30*60000;t<=seed+10*60000;t+=10*60000) if(t>now) times.add(Math.floor(t/60000)*60000);
      predictions=[current];
      const candidates=[...times].sort((a,b)=>a-b);
      // Three concurrent calls limit provider pressure and complete under the lease.
      for(let i=0;i<candidates.length;i+=3) predictions.push(...await Promise.all(candidates.slice(i,i+3).map(async t=>prediction(await provider.route(origin,destination,new Date(t).toISOString()),new Date(t).toISOString()))));
      predictionsAt=new Date(now).toISOString();
    }
    const usable=[current,...predictions.filter(p=>Date.parse(p.departure)>now)];
    const snapshot:Snapshot={settingsKey:key,updatedAt:new Date(now).toISOString(),predictionsAt,current,predictions:usable,recommendation:recommend(s,usable,current,now)};
    // Settings can change while TomTom is in flight; don't replace a new route.
    const latest=await storage.get<Settings>('settings');
    if (latest && settingsKey(latest)===key) await storage.set('snapshot',snapshot);
    await storage.set('retry',{until:0});
    return serializeDisplay(s,snapshot,now);
  } catch(e) {
    const error=e instanceof ProviderError?e:new ProviderError('server_error');
    await storage.set('retry',{until:now+60000,kind:error.kind,message:error.message});
    return serializeDisplay(s,old,now,old?'cached':error.kind,error.message);
  } finally { await storage.release('refresh',owner); }
}
