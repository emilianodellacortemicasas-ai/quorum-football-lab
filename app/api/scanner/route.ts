import { env } from 'cloudflare:workers';
import { getIdentity, isOwner } from '../../../lib/identity';
import { kindFactor, ticketReliability } from '../../../lib/calibration';
import { loadCalibration } from '../../../lib/calibration-store';
import { italianMarkets, italianDebug, italianStatus } from '../../../lib/italian-odds';
import { buildTickets } from '../../../lib/tickets';
import { weeklyBomb, performance } from '../../../lib/settle';
import { latestPicks, latestPredictions, runScan } from '../../../lib/scanner';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 if(!await getIdentity(request))return reply({error:'Accedi al laboratorio.'},401);
 try{
  const view=new URL(request.url).searchParams.get('view');
  if(view==='italian-markets'&&await isOwner(request,await getIdentity(request))){try{return reply(await italianMarkets(new URL(request.url).searchParams.get('q')||'double'));}catch(e){return reply({error:e instanceof Error?e.message:'Errore'});}}
  if(view==='italian-debug'&&await isOwner(request,await getIdentity(request))){try{return reply(await italianDebug());}catch(e){return reply({error:e instanceof Error?e.message:'Errore'});}}
  if(view==='italian'){try{return reply(await italianStatus());}catch(e){return reply({connected:true,error:e instanceof Error?e.message:'Errore'});}}
  if(view==='performance')return reply(await performance());
  if(view==='tickets'){
   const p=await latestPredictions(),[cal,perf,history]=await Promise.all([loadCalibration().catch(()=>null),performance().catch(()=>null),env.DB!.prepare("SELECT payload FROM model_state WHERE id='ticket-backtest'").first<{payload:string}>().then(r=>r?JSON.parse(r.payload):null).catch(()=>null)]);
   const b=buildTickets(p.matches),wk=await weeklyBomb().catch(()=>null);
   const bomb=wk?(()=>{const legs=wk.legs.map((l:any)=>({se:Math.sqrt(l.p*(1-l.p)/40),italian:false,...l})),r=ticketReliability(legs);return {kind:'bomba',title:'Bomba della settimana',description:'Una sola Bomba a settimana, fissa da lunedì: 5–8 esiti per una quota da sogno. Vince di rado: puntata minima.',legs,odds:wk.odds,p:r.p,low:r.low,high:r.high,ev:r.p*wk.odds-1,kelly:0,italian:legs.every((l:any)=>l.italian),started:legs.some((l:any)=>Date.parse(l.kickoff)<=Date.now()),result:wk.result,week:wk.week};})():b.bomb;
   const adj=(t:any)=>{if(!t)return t;const f=kindFactor(history?.byKind?.find((k:any)=>k.kind===t.kind));return {...t,pRaw:t.p,p:Math.min(0.99,t.p*f),low:Math.min(0.99,t.low*f),high:Math.min(0.99,t.high*f),ev:Math.min(0.99,t.p*f)*t.odds-1,kelly:(()=>{const e=Math.min(0.99,t.p*f)*t.odds-1;return e>0?Math.min(0.02,e/(t.odds-1)*0.25):0;})(),factor:f};};
   return reply({run:p.run,singles:b.singles.map(adj),tickets:b.tickets.map(adj),probable:b.probable.map(adj),bomb:adj(bomb),candidates:b.candidates,calibration:cal?{backtestSamples:cal.backtestSamples,liveSamples:cal.liveSamples,backtestAt:cal.backtestAt}:null,track:perf?.tickets??[],history});
  }
  return reply(view==='predictions'?await latestPredictions():await latestPicks());
 }catch(e){return reply({error:e instanceof Error?e.message:'Scanner non disponibile.'},500);}
}
// Manual refresh: owner only, no frequency cap. Only the odds-credit reserve in runScan can stop it.
export async function POST(request:Request){
 const who=await getIdentity(request);if(!who)return reply({error:'Accedi al laboratorio.'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Origine non valida.'},403);
 if(!await isOwner(request,who))return reply({error:'Solo l’amministratore può avviare una scansione manuale.'},403);
 try{
  await runScan('manual');return reply(await latestPicks());
 }catch(e){return reply({error:e instanceof Error?e.message:'Scansione non riuscita.'},422);}
}
