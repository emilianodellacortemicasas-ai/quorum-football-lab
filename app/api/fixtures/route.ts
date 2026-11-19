import { getFixtures, getLiveMatch, hasFootballKey } from '../../../lib/provider';
export async function GET(request:Request) {
  if(!request.headers.get('oai-authenticated-user-id'))return Response.json({error:'Accedi al tuo laboratorio.'},{status:401,headers:{'Cache-Control':'no-store'}});
  const u=new URL(request.url);
  if(!await hasFootballKey())return Response.json({connected:false,matches:[],message:'Collega API-Football o Sportmonks per il calendario reale.'},{headers:{'Cache-Control':'no-store'}});
  try {return Response.json(u.searchParams.has('id')?{connected:true,match:await getLiveMatch(u.searchParams.get('id')!)}:{connected:true,matches:await getFixtures(u.searchParams.get('date')||'',u.searchParams.get('league')||undefined,u.searchParams.get('provider')||'auto')},{headers:{'Cache-Control':'no-store'}});}
  catch(e){return Response.json({error:e instanceof Error?e.message:'Dati non disponibili.'},{status:422});}
}
