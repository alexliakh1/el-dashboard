import type { Prediction } from '../shared/types.ts';
import { Storage } from './storage.ts';
export class ProviderError extends Error { constructor(public kind: 'no_route'|'server_error'|'missing_configuration') { super(kind === 'no_route' ? 'No driving route was found.' : kind === 'missing_configuration' ? 'TomTom is not configured on the server.' : 'Traffic service is temporarily unavailable.'); } }
type Location = { lat:number; lon:number; label:string };
type Summary = { travelTimeInSeconds:number; noTrafficTravelTimeInSeconds?:number; trafficDelayInSeconds?:number; departureTime:string; arrivalTime:string; lengthInMeters:number };
export function parseSummary(data:unknown):Summary {
  const s=(data as {routes?:{summary?:Summary}[]} | null)?.routes?.[0]?.summary;
  if (!s) throw new ProviderError('no_route');
  if (!Number.isFinite(s.travelTimeInSeconds) || s.travelTimeInSeconds <= 0 || !Number.isFinite(s.lengthInMeters) || s.lengthInMeters < 0 || !Number.isFinite(Date.parse(s.departureTime)) || !Number.isFinite(Date.parse(s.arrivalTime)) || (s.noTrafficTravelTimeInSeconds !== undefined && (!Number.isFinite(s.noTrafficTravelTimeInSeconds) || s.noTrafficTravelTimeInSeconds < 0)) || (s.trafficDelayInSeconds !== undefined && (!Number.isFinite(s.trafficDelayInSeconds) || s.trafficDelayInSeconds < 0))) throw new ProviderError('server_error');
  return s;
}
export class TomTom {
  constructor(readonly key:string, readonly storage:Storage, readonly fetcher:typeof fetch=fetch) {}
  async json(url:URL) {
    if (!this.key) throw new ProviderError('missing_configuration');
    url.searchParams.set('key',this.key);
    try { const r=await this.fetcher(url,{signal:AbortSignal.timeout(8000)}); if (!r.ok) throw new ProviderError('server_error'); return await r.json(); }
    catch(e) { if (e instanceof ProviderError) throw e; throw new ProviderError('server_error'); }
  }
  async geocode(query:string):Promise<Location> {
    const key='geo:'+query.toLowerCase();
    const cached=await this.storage.get<{at:number;value:Location}>(key);
    if (cached && Date.now()-cached.at < 30*86400000) return cached.value;
    const u=new URL(`https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json`); u.searchParams.set('limit','1');
    const data=await this.json(u) as {results?:{position?:{lat:number;lon:number};address?:{freeformAddress:string}}[]};
    const match=data?.results?.[0], p=match?.position;
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat)>90 || Math.abs(p.lon)>180) throw new ProviderError('no_route');
    const value={...p,label:match?.address?.freeformAddress || query}; await this.storage.set(key,{at:Date.now(),value}); return value;
  }
  async route(origin:Location,destination:Location,time:string,mode:'departAt'|'arriveAt'='departAt'):Promise<Summary> {
    const u=new URL(`https://api.tomtom.com/routing/1/calculateRoute/${origin.lat},${origin.lon}:${destination.lat},${destination.lon}/json`);
    for (const [key,value] of Object.entries({traffic:'true',travelMode:'car',routeType:'fastest',routeRepresentation:'summaryOnly',computeTravelTimeFor:'all',[mode]:time})) u.searchParams.set(key,value);
    return parseSummary(await this.json(u));
  }
}
export function prediction(s:Summary, departure=s.departureTime):Prediction { return {departure,minutes:s.travelTimeInSeconds/60,delayMinutes:Math.max(s.trafficDelayInSeconds || 0,s.travelTimeInSeconds-(s.noTrafficTravelTimeInSeconds ?? s.travelTimeInSeconds),0)/60}; }
