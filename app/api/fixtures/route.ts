import { env } from 'cloudflare:workers';
import { getIdentity } from '../../../lib/identity';
import { getFixtures, getLiveMatch, hasFootballKey } from '../../../lib/provider';
export async function GET(request:Request) {
  if(!await getIdentity(request))return Response.json({error:'Accedi al tuo laboratorio.'},{status:401,headers:{'Cache-Control':'no-store'}});
  const u=new URL(request.url);
  if(!await hasFootballKey())return Response.json({connected:false,matches:[],message:'Collega API-Football o Sportmonks per il calendario reale.'},{headers:{'Cache-Control':'no-store'}});
  try {return Response.json(u.searchParams.has('id')?{connected:true,match:await getLiveMatch(u.searchParams.get('id')!)}:{connected:true,matches:await withPast(await getFixtures(u.searchParams.get('date')||'',u.searchParams.get('league')||undefined,u.searchParams.get('provider')||'auto'))},{headers:{'Cache-Control':'no-store'}});}
  catch(e){return Response.json({error:e instanceof Error?e.message:'Dati non disponibili.'},{status:422});}
}

// For finished matches: what QUORUM predicted in its last scan before kickoff.
async function withPast(ms:any[]){
  const done=ms.filter(m=>m.final);if(!done.length)return ms;
  const rows=await Promise.all(done.map(m=>env.DB!.prepare('SELECT markets FROM scanner_matches WHERE fixture_id=? ORDER BY created_at DESC LIMIT 1').bind(m.id).first<{markets:string}>().catch(()=>null)));
  const by=new Map(done.map((m,i)=>[m.id,rows[i]?JSON.parse(rows[i]!.markets):null]));
  return ms.map(m=>{const mk=by.get(m.id);if(!mk)return m;const p=(k:string)=>Number.isFinite(mk[k]?.pBlend)?mk[k].pBlend:null;const h=p('home'),d=p('draw'),a=p('away');return h!==null&&d!==null&&a!==null?{...m,past:{home:h,draw:d,away:a,over25:p('over25'),btts:p('btts')}}:m;});
}
