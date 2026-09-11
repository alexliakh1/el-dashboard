"use client";
import { useEffect, useState } from 'react';
import type { DisplayPayload } from '../shared/types';
export function PredictionGraph({data}:{data:DisplayPayload|null}) {
  const points=data?.predictions.filter(p=>Date.parse(p.departure)<=data.serverEpoch*1000+90*60000) || [];
  if(points.length<2)return <div className="graph-empty">A clearer view of the road ahead.<br/><span>Your traffic forecast will appear here.</span></div>;
  const low=Math.max(0,Math.floor(Math.min(...points.map(p=>p.minutes))-3)), high=Math.ceil(Math.max(...points.map(p=>p.minutes))+3);
  const start=Date.parse(points[0].departure), end=Date.parse(points.at(-1)!.departure);
  const x=(t:string)=>50+(Date.parse(t)-start)/(end-start)*480, y=(v:number)=>150-(v-low)/(high-low)*110;
  const leave=data?.recommendation?.leaveBy;
  return <svg className="prediction-graph" viewBox="0 0 570 200" role="img" aria-label={`Predicted driving times from ${points[0].time} to ${points.at(-1)!.time}`}>
    {[low,Math.round((high+low)/2),high].map((v,i)=><g key={i}><line x1="50" y1={y(v)} x2="535" y2={y(v)} stroke="#d7d7cc" strokeDasharray="3 5"/><text x="4" y={y(v)+5}>{v}m</text></g>)}
    <polyline points={points.map(p=>`${x(p.departure)},${y(p.minutes)}`).join(' ')} fill="none" stroke="#6c8d15" strokeWidth="3"/>
    {points.map(p=><circle key={p.departure} cx={x(p.departure)} cy={y(p.minutes)} r="4" fill="#6c8d15"><title>{p.time}: {p.minutes} minutes</title></circle>)}
    {leave&&Date.parse(leave)>=start&&Date.parse(leave)<=end&&<g><line x1={x(leave)} x2={x(leave)} y1="22" y2="155" stroke="#bd471c" strokeDasharray="4 3"/><text x={Math.min(460,Math.max(50,x(leave)-24))} y="17" fill="#bd471c">Leave by</text></g>}
    <text x="50" y="185">{points[0].time}</text><text x="535" y="185" textAnchor="end">{points.at(-1)!.time}</text>
  </svg>;
}
export function DisplayPreview({data}:{data:DisplayPayload|null}) {
  const [clock,setClock]=useState<{data:DisplayPayload|null;elapsed:number}>({data:null,elapsed:0});
  useEffect(()=>{const received=Date.now();const id=setInterval(()=>setClock({data,elapsed:Math.max(0,(Date.now()-received)/1000)}),1000);return()=>clearInterval(id);},[data]);
  const elapsed=clock.data===data?clock.elapsed:0;
  const rec=data?.recommendation, isEta=data?.display.mode==='eta';
  const age=Math.floor(((data?.ageSeconds??0)+elapsed)/60);
  const stale=age*60>=(data?.staleAfterSeconds??420);
  const duration=(v:number)=>v<100?`${v} min`:v<6000?`${Math.floor(v/60)}h ${String(v%60).padStart(2,'0')}m`:`${Math.floor(v/60)}h`;
  const local=new Date(((data?.display.etaEpoch??0)+elapsed+(data?.display.etaUtcOffsetSeconds??0))*1000);
  const eta=`${local.getUTCHours()%12||12}:${String(local.getUTCMinutes()).padStart(2,'0')} ${local.getUTCHours()<12?'AM':'PM'}`;
  const updated=age<100?`Updated ${age} min ago`:age<1440?`Updated ${Math.floor(age/60)} hr ago`:`Updated ${Math.min(999,Math.floor(age/1440))}d ago`;
  const delay=rec?.trafficDelayMinutes??0;
  const bottom=stale?updated:delay>=1?'Delay':'No added delay';
  const usable=rec && data?.status!=='no_route';
  return <div className="led-case"><svg viewBox="0 0 128 32" role="img" aria-label={usable?`${isEta?'Arrive':'Drive'} ${isEta?eta:duration(rec.currentTravelMinutes)}. ${bottom}${!stale&&delay>=1?' +'+duration(delay):''}`:'Save your next commute to begin'} className="led-preview">
    <rect width="128" height="32" fill="#020707"/>
    {!usable?<><text x="3" y="11" fontSize="6" fill="white">Set up your commute</text><text x="3" y="25" fontSize="5" fill="#91a3ab">Save your next arrival date</text></>:<>
      <path d="M3 8L5 4H11L13 8V12H3V8H13 M5 12V14 M11 12V14" stroke="#a4cddf" strokeWidth="1" fill="none"/>
      <text x="20" y="12" fontSize="7" fill="white">{isEta?'Arrive':'Drive'}</text>
      <text x="124" y="12" fontSize="7" textAnchor="end" fill={stale?'#ffbc55':'#90ee70'}>{isEta?eta:duration(rec.currentTravelMinutes)}</text>
      {!stale&&(delay>=1?<path d="M7 19L1 29H13Z M7 22V25 M7 27V28" stroke="#ffbc55" strokeWidth="1" fill="none"/>:<path d="M2 24L5 27L12 20" stroke="#90ee70" strokeWidth="1" fill="none"/>)}
      <text x={stale?8:20} y="29" fontSize="7" fill={stale?'#ffbc55':'white'}>{bottom}</text>
      {!stale&&delay>=1&&<text x="124" y="29" fontSize="7" textAnchor="end" fill="#ffbc55">+{duration(delay)}</text>}
    </>}
  </svg></div>;
}
