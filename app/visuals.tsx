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
  const [screen,setScreen]=useState(0);
  useEffect(()=>{if(!data?.display.rotateScreens)return;const id=setInterval(()=>setScreen(s=>(s+1)%5),10000);return()=>clearInterval(id);},[data?.display.rotateScreens]);
  const view=data?.display.rotateScreens?screen:0, rec=data?.recommendation;
  const color=rec?.trend==='worsening'?'#ff873c':rec?.trend==='improving'?'#78e85d':'#f4d451';
  return <><div className="led-case"><svg viewBox="0 0 128 32" role="img" aria-label={rec?.message||'Display needs commute configuration'} className="led-preview"><rect width="128" height="32" fill="#020707"/>
    {!rec?<><text x="2" y="11" fontSize="6" fill="#ffffff">{data?.status==='server_error'?'SERVER ERROR':'SET UP YOUR COMMUTE'}</text><text x="2" y="23" fontSize="5" fill="#708b93">SAVE SETTINGS TO BEGIN</text></>:view===3?<><text x="2" y="8" fontSize="6" fill={color}>TRAFFIC {rec.trend.toUpperCase()}</text><text x="2" y="20" fontSize="6" fill="white">{data?.display.changeTime?`CHANGE ${data.display.changeTime}`:'STEADY ROAD AHEAD'}</text></>:view===4?<MiniGraph data={data!} color={color}/>:<><text x="2" y="6" fontSize="5" fill="#91a3ab">{rec.feasible?'LEAVE BY':'LEAVE NOW'}</text><text x="126" y="6" fontSize="5" textAnchor="end" fill={color}>{rec.predictedTravelMinutes} MIN</text><text x="2" y="23" fontSize="16" fill="white">{data?.display.leaveTime.replace(/ [AP]M/,'')}</text><text x="80" y="14" fontSize="6" fill="white">{data?.display.leaveTime.match(/[AP]M/)?.[0]||''}</text><text x="80" y="24" fontSize="5" fill="#91a3ab">{data?.display.arriveTime}</text></>}
    <text x="2" y="31" fontSize="4" fill={data?.status==='cached'?'#ff873c':'#708b93'}>{data?.status==='cached'?'OFFLINE ':''}{data?.updatedAt?`${Math.floor(data.ageSeconds/60)}m OLD`:'WAITING'}</text>
  </svg></div><div className="preview-controls">{['Departure','Traffic','Trend'].map((v,i)=><button key={v} type="button" className="secondary" onClick={()=>setScreen(i===0?0:i+2)} disabled={!rec||!data?.display.rotateScreens}>{v}</button>)}</div></>;
}
function MiniGraph({data,color}:{data:DisplayPayload;color:string}) {
  const p=data.predictions.slice(0,10), max=Math.max(...p.map(v=>v.minutes),1), min=Math.min(...p.map(v=>v.minutes),0);
  return <><text x="1" y="6" fontSize="5" fill="#91a3ab">{Math.ceil(max)}m</text><polyline points={p.map((v,i)=>`${20+i/Math.max(1,p.length-1)*105},${23-(v.minutes-min)/(max-min)*17}`).join(' ')} fill="none" stroke={color} strokeWidth="1"/></>;
}
