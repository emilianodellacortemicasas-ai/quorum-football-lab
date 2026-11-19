import { getIdentity, isOwner } from '../../../lib/identity';
import { latestPicks, lastRun, runScan } from '../../../lib/scanner';
import { reserveOperation } from '../../../lib/vault';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 if(!await getIdentity(request))return reply({error:'Accedi al laboratorio.'},401);
 try{return reply(await latestPicks());}catch(e){return reply({error:e instanceof Error?e.message:'Scanner non disponibile.'},500);}
}
// Manual refresh: owner only, at most 3 per day and never within 30 minutes of the previous scan (protects odds credits).
export async function POST(request:Request){
 const who=await getIdentity(request);if(!who)return reply({error:'Accedi al laboratorio.'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Origine non valida.'},403);
 if(!await isOwner(request,who))return reply({error:'Solo l’amministratore può avviare una scansione manuale.'},403);
 try{
  const last=await lastRun();
  if(last?.status==='ok'&&Date.now()-Date.parse(last.started_at)<30*60000)return reply({error:'Ultima scansione meno di 30 minuti fa: le quote sono ancora aggiornate.'},429);
  if(!await reserveOperation('scan-manual:'+new Date().toISOString().slice(0,10),3))return reply({error:'Raggiunto il limite di 3 scansioni manuali al giorno.'},429);
  await runScan('manual');return reply(await latestPicks());
 }catch(e){return reply({error:e instanceof Error?e.message:'Scansione non riuscita.'},422);}
}
