import { Storage, type Database } from './storage.ts';
import { defaults, validateSettings } from './settings.ts';
import { commute } from './service.ts';
import { TomTom, ProviderError } from './tomtom.ts';
import { handleSearchRequest } from './search.ts';
import type { Settings } from '../shared/types.ts';
export type ApiEnv={DB?:Database;TOMTOM_API_KEY?:string;ADMIN_TOKEN?:string;DISPLAY_TOKEN?:string};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function handleApi(request:Request,env:ApiEnv):Promise<Response> {
  const u=new URL(request.url), display=u.pathname==='/api/display';
  const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
  const admin=env.ADMIN_TOKEN && token===env.ADMIN_TOKEN;
  if (!(admin || (display && env.DISPLAY_TOKEN && token===env.DISPLAY_TOKEN) || (local && !env.ADMIN_TOKEN))) return json({error:'Enter your dashboard access token.'},401);
  if (!env.DB) return json({error:'Settings storage is not configured. Apply the database migration.'},503);
  if (!['/api/search','/api/route','/api/display','/api/settings'].includes(u.pathname)) return json({error:'Not found.'},404);
  const methods=u.pathname==='/api/settings'?['GET','PUT']:u.pathname==='/api/route'?['POST']:['GET'];
  if (!methods.includes(request.method)) return new Response(null,{status:405,headers:{Allow:methods.join(', ')}});
  if (request.method==='PUT'||request.method==='POST') {
    if (request.headers.get('Origin') && request.headers.get('Origin')!==u.origin) return json({error:'Origin not allowed.'},403);
    if (!request.headers.get('Content-Type')?.includes('application/json')) return json({error:'Send JSON.'},415);
  }
  const storage=new Storage(env.DB), provider=new TomTom(env.TOMTOM_API_KEY || '',storage);
  try {
    if(u.pathname==='/api/search') {
      const q=(u.searchParams.get('q')||'').trim();
      if(q.length>160) return json({error:'Search is too long.'},400);
      const key='search:'+q.toLowerCase(), cached=await storage.get<{at:number;data:unknown}>(key);
      if(cached && Date.now()-cached.at<86400000) return json(cached.data);
      const allowed=await storage.acquire('search-rate',Date.now(),300);
      if(!allowed) return json({error:'Please wait a moment before searching again.'},429);
      const response=await handleSearchRequest(u,env), data=await response.json();
      if(response.ok && q.length>=3) await storage.set(key,{at:Date.now(),data});
      return json(data,response.status);
    }
    if(u.pathname==='/api/settings' && request.method==='GET') return json(await storage.get<Settings>('settings') || defaults());
    if(u.pathname==='/api/settings' && request.method==='PUT') {
      const raw=await request.text(); if(raw.length>4096) return json({error:'Settings are too large.'},413);
      let s:Settings; try{s=validateSettings(JSON.parse(raw));}catch(e){return json({error:e instanceof SyntaxError?'Invalid JSON.':(e as Error).message},400);}
      if(Date.parse(s.arriveBy)<=Date.now() || Date.parse(s.arriveBy)>Date.now()+365*86400000) return json({error:'Choose an arrival within the next year.'},400);
      // A settings save must not cancel a provider-imposed cooldown.
      await storage.set('settings',s);
      return json({settings:s,display:await commute(s,storage,provider,Date.now(),true)});
    }
    if(u.pathname==='/api/route') {
      const raw=await request.text(); if(raw.length>4096) return json({error:'Request is too large.'},413);
      let body;try{body=JSON.parse(raw);}catch{return json({error:'Invalid JSON.'},400);}
      if (!body || typeof body!=='object') return json({error:'Invalid request.'},400);
      // Preserve the original arrive-by route contract for existing clients.
      if(body.start || body.end || body.arriveAt) {
        let s;try{s=validateSettings({...defaults(),origin:body.start,destination:body.end,arriveBy:body.arriveAt});}catch{return json({error:'Enter valid locations and an arrival time.'},400);}
        if(Date.parse(s.arriveBy)<=Date.now()) return json({error:'Choose a future arrival time.'},400);
        const slot=await storage.acquire('legacy-rate',Date.now(),60000); if(!slot) return json({error:'Please wait one minute before recalculating.'},429);
        const [a,b]=await Promise.all([provider.geocode(s.origin),provider.geocode(s.destination)]), r=await provider.route(a,b,s.arriveBy,'arriveAt');
        return json({arrivalTime:r.arrivalTime,departureTime:r.departureTime,distanceMeters:r.lengthInMeters,startLabel:a.label,endLabel:b.label,travelTimeInSeconds:r.travelTimeInSeconds,trafficDelayInSeconds:Math.max(r.trafficDelayInSeconds||0,r.travelTimeInSeconds-(r.noTrafficTravelTimeInSeconds??r.travelTimeInSeconds))});
      }
    }
    const s=await storage.get<Settings>('settings')||defaults();
    return json(await commute(s,storage,provider,Date.now(),request.method==='POST'));
  } catch(e) { return json({error:e instanceof ProviderError?e.message:'Commute service is unavailable. Please try again.'},503); }
}
