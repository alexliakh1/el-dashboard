import type { DisplayPayload, Settings, Snapshot } from '../shared/types.ts';
import { activeNow } from './settings.ts';
import { recommend, timeLabel } from './recommendation.ts';
export function serializeDisplay(s:Settings, snapshot:Snapshot|null, now:number, status='ok', message?:string):DisplayPayload {
  const active=activeNow(s,now);
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:s.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const v=(k:string)=>Number(parts.find(p=>p.type===k)?.value);
  const offset=Math.round((Date.UTC(v('year'),v('month')-1,v('day'),v('hour'),v('minute'),v('second'))-Math.floor(now/1000)*1000)/1000);
  const rec=snapshot ? recommend(s,snapshot.predictions,snapshot.current,now) : undefined;
  const etaEpoch=Math.floor(now/1000)+(rec?.currentTravelMinutes ?? 0)*60;
  const etaParts=new Intl.DateTimeFormat('en-US',{timeZone:s.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(etaEpoch*1000);
  const e=(k:string)=>Number(etaParts.find(p=>p.type===k)?.value);
  const etaUtcOffsetSeconds=Date.UTC(e('year'),e('month')-1,e('day'),e('hour'),e('minute'),e('second'))/1000-etaEpoch;
  // Warn after the normal refresh interval plus time for a slow request.
  // A departure within 30 minutes deserves the active-window freshness limit.
  const departureSoon=!!rec && (!rec.feasible || (!!rec.leaveBy && Date.parse(rec.leaveBy)-now<=30*60000));
  const staleAfterSeconds=active || departureSoon ? 420 : 3900;
  return {status,message,serverEpoch:Math.floor(now/1000),utcOffsetSeconds:offset,staleAfterSeconds,ageSeconds:snapshot?Math.max(0,Math.floor((now-Date.parse(snapshot.updatedAt))/1000)):0,
    refreshAfterSeconds:active?60:300,active,updatedAt:snapshot?.updatedAt,predictionsAt:snapshot?.predictionsAt,
    route:{origin:s.origin.slice(0,80),destination:s.destination.slice(0,80),arriveBy:s.arriveBy},recommendation:rec,
    predictions:snapshot?.predictions.map(p=>({...p,minutes:Math.round(p.minutes*10)/10,delayMinutes:Math.round(p.delayMinutes*10)/10,time:timeLabel(p.departure,s.timezone)})) || [],
    display:{brightness:s.brightness,rotateScreens:false,mode:s.displayMode ?? 'drive',etaEpoch,etaUtcOffsetSeconds,leaveTime:rec?.leaveBy?timeLabel(rec.leaveBy,s.timezone):'NOW',arriveTime:s.arriveBy?timeLabel(s.arriveBy,s.timezone):'--:--',changeTime:rec?.changeAt?timeLabel(rec.changeAt,s.timezone):''} };
}
