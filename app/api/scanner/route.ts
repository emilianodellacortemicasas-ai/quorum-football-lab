import { getIdentity, isOwner } from '../../../lib/identity';
import { loadCalibration } from '../../../lib/calibration-store';
import { italianDebug, italianStatus } from '../../../lib/italian-odds';
import { buildTickets } from '../../../lib/tickets';
import { performance } from '../../../lib/settle';
import { latestPicks, latestPredictions, runScan } from '../../../lib/scanner';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 if(!await getIdentity(request))return reply({error:'Accedi al laboratorio.'},401);
 try{
  const view=new URL(request.url).searchParams.get('view');
  if(view==='italian-debug'&&await isOwner(request,await getIdentity(request))){try{return reply(await italianDebug());}catch(e){return reply({error:e instanceof Error?e.message:'Errore'});}}
  if(view==='italian'){try{return reply(await italianStatus());}catch(e){return reply({connected:true,error:e instanceof Error?e.message:'Errore'});}}
  if(view==='performance')return reply(await performance());
  if(view==='tickets'){const p=await latestPredictions(),[cal,perf]=await Promise.all([loadCalibration().catch(()=>null),performance().catch(()=>null)]);return reply({run:p.run,...buildTickets(p.matches),calibration:cal?{backtestSamples:cal.backtestSamples,liveSamples:cal.liveSamples,backtestAt:cal.backtestAt}:null,track:perf?.tickets??[]});}
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
