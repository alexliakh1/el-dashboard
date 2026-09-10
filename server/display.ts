import type { DisplayPayload, Settings, Snapshot } from '../shared/types.ts';
import { activeNow } from './settings.ts';
import { recommend, timeLabel } from './recommendation.ts';
export function serializeDisplay(s:Settings, snapshot:Snapshot|null, now:number, status='ok', message?:string):DisplayPayload {
  const active=activeNow(s,now);
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:s.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const v=(k:string)=>Number(parts.find(p=>p.type===k)?.value);
  const offset=Math.round((Date.UTC(v('year'),v('month')-1,v('day'),v('hour'),v('minute'),v('second'))-Math.floor(now/1000)*1000)/1000);
  const rec=snapshot ? recommend(s,snapshot.predictions,snapshot.current,now) : undefined;
  return {status,message,serverEpoch:Math.floor(now/1000),utcOffsetSeconds:offset,ageSeconds:snapshot?Math.max(0,Math.floor((now-Date.parse(snapshot.updatedAt))/1000)):0,
    refreshAfterSeconds:active?60:300,active,updatedAt:snapshot?.updatedAt,predictionsAt:snapshot?.predictionsAt,
    route:{origin:s.origin.slice(0,80),destination:s.destination.slice(0,80),arriveBy:s.arriveBy},recommendation:rec,
    predictions:snapshot?.predictions.map(p=>({...p,minutes:Math.round(p.minutes*10)/10,delayMinutes:Math.round(p.delayMinutes*10)/10,time:timeLabel(p.departure,s.timezone)})) || [],
    display:{brightness:s.brightness,rotateScreens:s.rotateScreens,leaveTime:rec?.leaveBy?timeLabel(rec.leaveBy,s.timezone):'NOW',arriveTime:s.arriveBy?timeLabel(s.arriveBy,s.timezone):'--:--',changeTime:rec?.changeAt?timeLabel(rec.changeAt,s.timezone):''} };
}
