import { z } from 'zod';
import { env } from 'cloudflare:workers';
import { getIdentity, isOwner } from '../../../lib/identity';
import { storedResults } from '../../../lib/sportmonks';
import { backtest } from '../../../lib/backtest';
import { refreshBacktest, refreshTicketBacktest } from '../../../lib/backtest-job';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 if(!await getIdentity(request))return reply({error:'Accedi al laboratorio.'},401);
 const row=await env.DB!.prepare("SELECT built_at,payload FROM model_state WHERE id='backtest'").first<{built_at:string;payload:string}>();
 return reply(row?{at:row.built_at,...JSON.parse(row.payload)}:{at:null});
}
const cfg=z.object({halfLife:z.number().min(10).max(1000).optional(),prior:z.number().min(0).max(50).optional(),fitRho:z.boolean().optional(),windowDays:z.number().min(60).max(400).optional(),scale:z.number().min(0.7).max(1.4).optional(),label:z.string().max(60).optional()}).strict();
const input=z.object({tickets:z.literal(true).optional(),refresh:z.literal(true).optional(),configs:z.array(cfg).min(1).max(16),testDays:z.number().min(28).max(300).optional(),save:z.boolean().optional()}).strict();
// Owner only: runs the walk-forward backtest for the given configurations. With save=true the first result is published in the app.
export async function POST(request:Request){
 const who=await getIdentity(request);if(!who)return reply({error:'Accedi al laboratorio.'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Origine non valida.'},403);
 if(!await isOwner(request,who))return reply({error:'Solo l’amministratore.'},403);
 try{
  const raw=await request.json() as any;
  if(raw?.tickets===true){const t0=Date.now();const out=await refreshTicketBacktest(Array.isArray(raw.weights)?raw.weights.filter((w:any)=>typeof w==='number'&&w>=0&&w<=1).slice(0,5):undefined);return reply({ms:Date.now()-t0,...out});}
  if(raw?.refresh===true){const t0=Date.now();await refreshBacktest(true);return reply({refreshed:true,ms:Date.now()-t0});}
  const b=input.parse(raw),results=await storedResults(),t0=Date.now();
  const metrics=b.configs.map(c=>backtest(results,c,b.testDays??150));
  if(b.save)await env.DB!.prepare("INSERT INTO model_state (id,built_at,payload) VALUES ('backtest',?,?) ON CONFLICT(id) DO UPDATE SET built_at=excluded.built_at,payload=excluded.payload").bind(new Date().toISOString(),JSON.stringify({metrics:metrics[0],config:b.configs[0],testDays:b.testDays??150,results:results.length})).run();
  return reply({results:results.length,ms:Date.now()-t0,metrics});
 }catch(e){return reply({error:e instanceof Error?e.message:'Backtest non riuscito.'},422);}
}
