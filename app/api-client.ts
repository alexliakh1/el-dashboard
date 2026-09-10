let accessToken = '';
export function setAccessToken(token:string) { accessToken=token.trim(); }
export function apiFetch(url:string,init:RequestInit={}) {
  const headers=new Headers(init.headers);
  if(accessToken) headers.set('Authorization',`Bearer ${accessToken}`);
  return fetch(url,{...init,headers});
}
export async function api<T>(url:string,init:RequestInit={}):Promise<T> {
  const r=await apiFetch(url,init), data=await r.json();
  if(!r.ok) throw new Error(data.error || 'The server could not complete the request.');
  return data;
}
