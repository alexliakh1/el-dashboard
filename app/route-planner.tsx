"use client";
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { DisplayPayload, Settings } from '../shared/types';
import { AddressField } from './address-field';
import { api, setAccessToken } from './api-client';
import { DisplayPreview, PredictionGraph } from './visuals';
const localValue=(d:Date)=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
export default function RoutePlanner() {
  const [settings,setSettings]=useState<Settings|null>(null), [arrival,setArrival]=useState('');
  const [data,setData]=useState<DisplayPayload|null>(null), [error,setError]=useState(''), [busy,setBusy]=useState(false);
  const [token,setToken]=useState(''), [connected,setConnected]=useState(false), [notice,setNotice]=useState(''), [dirty,setDirty]=useState(false);
  async function load() {
    setBusy(true);setError('');
    try { const s=await api<Settings>('/api/settings');setSettings(s);
      const next=new Date();next.setDate(next.getDate()+1);next.setHours(8,30,0,0);
      setArrival(localValue(s.arriveBy?new Date(s.arriveBy):next));
      setData(await api<DisplayPayload>('/api/display'));setConnected(true);
    } catch(e) {setError((e as Error).message);setConnected(false);} finally {setBusy(false);}
  }
  useEffect(()=>{const id=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(id);},[]);
  useEffect(()=>{
    const id=window.setInterval(()=>{if(!busy && connected) api<DisplayPayload>('/api/display').then(d=>{setData(d);setError('');}).catch(e=>setError(e.message));},60000);
    return ()=>window.clearInterval(id);
  },[busy,connected]);
  function update<K extends keyof Settings>(key:K,value:Settings[K]) {setSettings(s=>s?{...s,[key]:value}:s);setDirty(true);setNotice('');}
  async function save(e:FormEvent) {
    e.preventDefault();if(!settings)return;setBusy(true);setError('');setNotice('');
    try {const result=await api<{settings:Settings;display:DisplayPayload}>('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...settings,arriveBy:new Date(arrival).toISOString()})});
      setSettings(result.settings);setData(result.display);setDirty(false);setNotice('Settings saved. Your display will update on its next check.');
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function refresh() {
    setBusy(true);setError('');try{setData(await api<DisplayPayload>('/api/route',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));setNotice('Latest available traffic loaded.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const rec=data?.recommendation;
  return <main className="dashboard">
    <header className="dash-top"><Link className="brand" href="/"><span className="brand-mark">LB</span>Leave by</Link><span className="connection">{connected&&!error?'Server connected':busy?'Connecting…':'Server disconnected'}</span></header>
    <div className="page-heading"><div><p className="eyebrow">Your daily head start</p><h1>A calmer commute.</h1></div><button className="secondary" type="button" disabled={busy||!settings} onClick={refresh}>{busy?'Checking traffic…':'↻ Refresh traffic'}</button></div>
    {error&&<div role="alert" className="error-card">{error}</div>}
    {!connected&&<form className="panel access" onSubmit={e=>{e.preventDefault();setAccessToken(token);void load();}}><label>Dashboard access token<input type="password" autoComplete="current-password" value={token} onChange={e=>setToken(e.target.value)}/></label><button disabled={busy}>Connect</button><p>Use the separate dashboard token configured on your server.</p></form>}
    <div className="dashboard-grid"><section className="commute-output" aria-label="Commute recommendation">
      <article className="recommendation-card" aria-live="polite"><div className="card-heading"><span className="eyebrow">{data?.status==='cached'?'Last known recommendation':'Your departure'}</span><span className={`trend ${rec?.trend||''}`}>{rec?.trend||'Awaiting route'}</span></div>
        <p className="departure-label">{rec?.feasible?'Leave by':rec?'Leave now':'Let’s plan your trip'}</p><div className="departure-time">{rec?.feasible?data?.display.leaveTime:rec?'NOW':'—:—'}</div>
        <p className="recommendation-copy">{data?.message || rec?.message || 'Save an origin, destination, and arrival time to get your recommendation.'}</p>
        <div className="metric-grid"><Metric label="Current drive" value={rec?`${rec.currentTravelMinutes} min`:'—'}/><Metric label="Traffic delay" value={rec?`+${rec.trafficDelayMinutes} min`:'—'}/><Metric label="Arrive by" value={data?.display.arriveTime||'—'}/></div>
        <p className="meta">{data?.updatedAt?`Updated ${new Date(data.updatedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} · ${data.active?'Commute window active':'Reduced refresh outside active hours'}`:'Live + historical estimates from TomTom'}</p>
      </article>
      <article className="panel"><div className="card-heading"><h2>Traffic ahead</h2><span className="meta">Next 90 minutes</span></div><PredictionGraph data={data}/><p className="meta">{rec?`${rec.parkingWalkingMinutes} min parking / walking + ${rec.safetyBufferMinutes} min safety buffer included.`:'Predictions appear after your route is saved.'}</p></article>
      <article className="panel display-panel"><div className="card-heading"><h2>On your display</h2><span className="meta">128 × 32 · two panels</span></div><DisplayPreview data={data}/><p className="meta">Preview of saved settings. Hardware connection is verified on the panel.</p></article>
    </section><aside className="panel settings-panel"><div className="card-heading"><h2>Commute settings</h2><span className="meta">{dirty?'Unsaved changes':'Your route'}</span></div>
    {settings?<form onSubmit={save}>
      <AddressField label="Origin" dotClass="start-dot" value={settings.origin} placeholder="Home address" onChange={v=>update('origin',v)}/>
      <AddressField label="Destination" dotClass="end-dot" value={settings.destination} placeholder="Work, school, or an address" onChange={v=>update('destination',v)}/>
      <label>Arrive by<input type="datetime-local" required value={arrival} onChange={e=>{setArrival(e.target.value);setDirty(true);}}/></label><p className="meta">Date and time entered in {Intl.DateTimeFormat().resolvedOptions().timeZone}. Choose the next date after each trip.</p>
      <div className="field-pair"><label>Safety buffer <span className="meta">min</span><input type="number" min="0" max="120" required value={settings.safetyBufferMinutes} onChange={e=>update('safetyBufferMinutes',e.target.valueAsNumber)}/></label><label>Parking / walking <span className="meta">min</span><input type="number" min="0" max="120" required value={settings.parkingWalkingMinutes} onChange={e=>update('parkingWalkingMinutes',e.target.valueAsNumber)}/></label></div>
      <fieldset><legend>Active weekdays</legend><div className="weekdays">{['S','M','T','W','T','F','S'].map((day,i)=><button key={i} type="button" className={settings.activeWeekdays.includes(i)?'selected':''} aria-label={['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][i]} aria-pressed={settings.activeWeekdays.includes(i)} onClick={()=>update('activeWeekdays',settings.activeWeekdays.includes(i)?settings.activeWeekdays.filter(d=>d!==i):[...settings.activeWeekdays,i])}>{day}</button>)}</div></fieldset>
      <div className="field-pair"><label>Active from<input type="time" required value={settings.activeStart} onChange={e=>update('activeStart',e.target.value)}/></label><label>Until<input type="time" required value={settings.activeEnd} onChange={e=>update('activeEnd',e.target.value)}/></label></div>
      <label>Display / schedule timezone<input required value={settings.timezone} onChange={e=>update('timezone',e.target.value)} list="timezones"/><datalist id="timezones">{['America/Los_Angeles','America/Denver','America/Chicago','America/New_York','Europe/London','UTC'].map(z=><option key={z} value={z}/>)}</datalist></label>
      <div className="settings-divider"/><label>Display brightness <strong>{Math.round(settings.brightness*100)}%</strong><input type="range" min="5" max="100" value={Math.round(settings.brightness*100)} onChange={e=>update('brightness',Number(e.target.value)/100)}/></label>
      <label className="toggle-label"><span>Rotate display screens<small>Departure, traffic message, and graph</small></span><input type="checkbox" checked={settings.rotateScreens} onChange={e=>update('rotateScreens',e.target.checked)}/></label>
      <button className="save-button" disabled={busy}>{busy?'Saving / checking traffic…':'Save & calculate'}</button><p className="save-notice" role="status">{notice}</p>
    </form>:<p>{busy?'Loading your settings…':'Connect to load your saved settings.'}</p>}</aside></div>
    <footer><span>Leave by · Powered by TomTom</span><span>Traffic estimates can change. Allow extra time for important trips.</span></footer>
  </main>;
}
function Metric({label,value}:{label:string;value:string}) {return <div><span>{label}</span><strong>{value}</strong></div>;}
