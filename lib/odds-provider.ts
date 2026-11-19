import { credentialValue } from './vault';
const cache=new Map<string,{until:number;data:any}>();
export const clearOddsCache=()=>cache.clear();
export async function oddsFeed(path:string,cacheSeconds=60):Promise<any>{
 const hit=cache.get(path);if(hit&&hit.until>Date.now())return hit.data;
 const key=await credentialValue('the-odds-api');if(!key)throw new Error('Collega The Odds API nella pagina Collegamenti.');
 const r=await fetch('https://api.the-odds-api.com/v4/'+path,{headers:{'x-api-key':key},signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error(r.status===429?'Quota The Odds API raggiunta. Controlla il piano.':r.status===401||r.status===403?'The Odds API non autorizza la richiesta. Controlla il collegamento.':'The Odds API non dispone di questi dati. Riprova o cambia evento.');
 const data={payload:await r.json(),remaining:r.headers.get('x-requests-remaining'),lastCost:r.headers.get('x-requests-last'),fetchedAt:new Date().toISOString()};
 if(cache.size>250)cache.clear();cache.set(path,{until:Date.now()+cacheSeconds*1000,data});return data;
}
