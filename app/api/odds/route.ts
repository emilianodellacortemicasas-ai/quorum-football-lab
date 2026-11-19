import { z } from 'zod';
import { oddsFeed } from '../../../lib/odds-provider';
import { cleanOddsEvent,cleanOddsQuotes,oddsMarketLabel } from '../../../lib/odds-contract';
import { reserveOperation } from '../../../lib/vault';
import { getIdentity } from '../../../lib/identity';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 if(!await getIdentity(request))return reply({error:'Accedi al laboratorio per consultare le quote.'},401);
 try{const {payload}=await oddsFeed('sports',3600);if(!Array.isArray(payload))throw new Error('Elenco delle competizioni non disponibile.');return reply({sports:payload.filter((s:any)=>s.group==='Soccer'&&s.active&&!s.has_outrights).map((s:any)=>({key:s.key,title:s.title}))});}catch(e){return reply({error:e instanceof Error?e.message:'Quote non disponibili.'},422);}
}
const input=z.object({action:z.enum(['events','markets','quotes']),sport:z.string().regex(/^soccer_[a-z0-9_]{2,90}$/),eventId:z.string().regex(/^[A-Za-z0-9_-]{5,100}$/).optional(),markets:z.array(z.string().regex(/^[a-z0-9_]{2,70}$/)).min(1).max(5).optional()}).strict();
export async function POST(request:Request){
 if(!await getIdentity(request))return reply({error:'Accedi al laboratorio.'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Origine non valida.'},403);
 try{
  const text=await request.text();if(text.length>2000)return reply({error:'Richiesta troppo grande.'},413);
  const b=input.parse(JSON.parse(text));if(b.action!=='events'&&!b.eventId)return reply({error:'Seleziona una partita.'},422);
  if(b.action==='quotes'&&!b.markets)return reply({error:'Seleziona un mercato.'},422);
  if(!await reserveOperation('odds-lookup:'+new Date().toISOString().slice(0,10),200))return reply({error:'Raggiunto il limite giornaliero delle consultazioni. Riprova domani.'},429);
  const path=b.action==='events'?'sports/'+b.sport+'/events':'sports/'+b.sport+'/events/'+b.eventId+'/'+(b.action==='markets'?'markets?regions=eu':'odds?regions=eu&oddsFormat=decimal&markets='+[...new Set(b.markets)].join(','));
  const d=await oddsFeed(path,b.action==='events'?300:60);
  if(b.action==='events')return reply({events:d.payload.filter((x:any)=>Date.parse(x.commence_time)>Date.now()).map(cleanOddsEvent)});
  if(b.action==='markets'){const keys=[...new Set<string>((d.payload.bookmakers||[]).flatMap((b:any)=>(b.markets||[]).map((m:any)=>m.key)))].filter(k=>typeof k==='string'&&/^[a-z0-9_]{2,70}$/.test(k));return reply({markets:keys.map(key=>({key,label:oddsMarketLabel(key)})),remaining:d.remaining,lastCost:d.lastCost});}
  const cleaned=cleanOddsQuotes(d.payload);if(Date.parse(cleaned.event.kickoff)<=Date.now())return reply({error:'La partita è iniziata. Il laboratorio confronta solo quote pre-partita.'},422);
  return reply({...cleaned,remaining:d.remaining,lastCost:d.lastCost,fetchedAt:d.fetchedAt,source:'The Odds API · regione EU'});
 }catch(e){return reply({error:e instanceof z.ZodError||e instanceof SyntaxError?'Controlla partita e mercati selezionati.':e instanceof Error?e.message:'Quote non disponibili.'},422);}
}
