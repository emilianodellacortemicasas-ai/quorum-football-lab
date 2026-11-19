import { env } from 'cloudflare:workers';
import { credentialValue } from './vault';
import { MODEL_V2, fitLeague, form, lambdas, parseResult, table, type LeagueModel, type Result, type TableRow } from './model-v2';
import { historicalGoalMeans,sportmonksCompetition,sportmonksFixture } from './sportmonks-contract';
import type { Match } from './types';
const cache=new Map<string,{until:number;data:any}>();
export const clearSportmonksCache=()=>cache.clear();
async function feed(path:string,seconds=300):Promise<any>{
 const hit=cache.get(path);if(hit&&hit.until>Date.now())return hit.data;
 const key=await credentialValue('sportmonks');if(!key)throw new Error('Collega Sportmonks nella pagina Collegamenti.');
 const r=await fetch('https://api.sportmonks.com/v3/football/'+path,{headers:{Authorization:key},signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error(r.status===429?'Sportmonks ha raggiunto il limite di richieste.':'Sportmonks non autorizza questi dati. Controlla piano e competizioni selezionate.');
 const data=await r.json() as any;if(!data.data||data.message&&data.data===null)throw new Error('Dati Sportmonks non disponibili.');
 if(cache.size>300)cache.clear();cache.set(path,{until:Date.now()+seconds*1000,data});return data;
}
async function pages(path:string,maxPages=5){const out:any[]=[];for(let page=1;page<=maxPages;page++){const d=await feed(path+(path.includes('?')?'&':'?')+'per_page=50&page='+page);if(!Array.isArray(d.data))throw new Error('Formato dei dati Sportmonks non riconosciuto.');out.push(...d.data);if(!d.pagination?.has_more)return out;}throw new Error('Troppi risultati Sportmonks per questa selezione. Restringi la data.');}
export async function getSportmonksFixtures(date:string,league?:string):Promise<Match[]>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Data non valida.');
 const data=await pages('fixtures/date/'+date+'?include=participants;league.country;state&timezone=Europe%2FRome');
 return data.filter(f=>!league||String(sportmonksCompetition(f.league)?.id)===league).map(sportmonksFixture).filter((m):m is Match=>m!==null);
}
type ModelState={builtAt:string;version:string;leagues:Record<string,LeagueModel>;tables:Record<string,TableRow[]>;forms:Record<string,string>;results:number};
let memo:{at:number;state:ModelState}|null=null;
// Builds the v2 model from ~13 months of results of the subscribed competitions and stores it in D1.
export async function buildModel():Promise<ModelState>{
 const now=Date.now(),results:Result[]=[];
 for(let w=0;w<4;w++){
  const end=new Date(now-86400000-w*99*86400000),start=new Date(end.getTime()-98*86400000);
  const data=await pages('fixtures/between/'+start.toISOString().slice(0,10)+'/'+end.toISOString().slice(0,10)+'?include=participants;scores;state;league.country',40);
  for(const f of data){const r=parseResult(f,sportmonksCompetition(f.league)?.name??null);if(r)results.push(r);}
 }
 const unique=[...new Map(results.map(r=>[r.id,r])).values()],leagues:Record<string,LeagueModel>={},tables:Record<string,TableRow[]>={},forms:Record<string,string>={};
 for(const comp of new Set(unique.map(r=>r.comp))){
  const rs=unique.filter(r=>r.comp===comp);
  if(comp!=='Coppa Italia'){const m=fitLeague(rs,now);if(m)leagues[comp]=m;}
  const season=rs.reduce((a,b)=>b.ts>a.ts?b:a).season;tables[comp]=table(rs,season);
 }
 const leagueOnly=unique.filter(r=>r.comp!=='Coppa Italia');
 for(const id of new Set(leagueOnly.flatMap(r=>[r.homeId,r.awayId])))forms[id]=form(leagueOnly,id,5);
 const state={builtAt:new Date().toISOString(),version:MODEL_V2,leagues,tables,forms,results:unique.length};
 const comps=[...new Set(unique.map(r=>r.comp))],compact=unique.map(r=>[r.id,r.ts,comps.indexOf(r.comp),r.homeId,r.awayId,r.hg,r.ag,r.season]);
 await env.DB!.prepare('INSERT INTO model_state (id,built_at,payload) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET built_at=excluded.built_at,payload=excluded.payload').bind('results',state.builtAt,JSON.stringify({comps,rows:compact})).run();
 await env.DB!.prepare('INSERT INTO model_state (id,built_at,payload) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET built_at=excluded.built_at,payload=excluded.payload').bind('v2',state.builtAt,JSON.stringify(state)).run();
 memo={at:Date.now(),state};return state;
}
export async function getModel(force=false):Promise<ModelState>{
 if(force)return buildModel();
 if(memo&&Date.now()-memo.at<10*60000)return memo.state;
 const row=await env.DB!.prepare("SELECT built_at,payload FROM model_state WHERE id='v2'").first<{built_at:string;payload:string}>();
 if(row&&Date.now()-Date.parse(row.built_at)<30*3600000){const state=JSON.parse(row.payload) as ModelState;memo={at:Date.now(),state};return state;}
 return buildModel();
}
function sidelinedNames(f:any,teamId:number):string[]|null{
 if(!Array.isArray(f.sidelined))return null;
 return f.sidelined.filter((s:any)=>(s.participant_id??s.sideline?.team_id)===teamId&&s.sideline?.completed!==true)
  .map((s:any)=>{const p=s.player||s.sideline?.player;const n=p?.display_name||p?.common_name||p?.name;const t=(s.type||s.sideline?.type)?.name;return n?(t?n+' ('+t+')':n):null;}).filter(Boolean).slice(0,12);
}
export async function getSportmonksMatch(id:string):Promise<Match>{
 if(!/^sm-\d{1,12}$/.test(id))throw new Error('Partita Sportmonks non valida.');
 let f:any;
 try{f=(await feed('fixtures/'+id.slice(3)+'?include=participants;league.country;state;sidelined.player;sidelined.type',300)).data;}
 catch{f=(await feed('fixtures/'+id.slice(3)+'?include=participants;league.country;state',300)).data;}
 const m=sportmonksFixture(f);
 if(!m)throw new Error('Competizione o dati Sportmonks non supportati.');
 if(f.state?.state!=='NS'||new Date(m.kickoff).getTime()<=Date.now())throw new Error('Il modello analizza solo partite non iniziate.');
 const state=await getModel(),h=f.participants.find((x:any)=>x.meta?.location==='home'),a=f.participants.find((x:any)=>x.meta?.location==='away');
 const league=state.leagues[m.competition==='Coppa Italia'?'Serie A':m.competition],l=league?lambdas(league,h.id,a.id):null;
 const tbl=state.tables[m.competition==='Coppa Italia'?'Serie A':m.competition]||[],ph=tbl.find(r=>r.teamId===h.id),pa=tbl.find(r=>r.teamId===a.id);
 const context={model:state.version,rho:league?.rho??0,homePos:ph?.position??null,awayPos:pa?.position??null,homePts:ph?.points??null,awayPts:pa?.points??null,teamsInTable:tbl.length,homeForm:state.forms[h.id]||'',awayForm:state.forms[a.id]||'',homeOut:sidelinedNames(f,h.id),awayOut:sidelinedNames(f,a.id),homeN:league?.teams[h.id]?.n??0,awayN:league?.teams[a.id]?.n??0};
 return {...m,sampleHome:context.homeN,sampleAway:context.awayN,lambdaHome:l?l.lh:null,lambdaAway:l?l.la:null,context,notes:[
  'Modello v2: forza di attacco e difesa di ogni squadra stimata su tutte le partite del campionato degli ultimi 13 mesi circa ('+state.results+' risultati), con peso maggiore alle più recenti (metà peso dopo 120 giorni).',
  'Include fattore campo del campionato e correzione Dixon–Coles sui risultati bassi. Punteggio dopo i 90 minuti.',
  l?'Stima basata su '+context.homeN+' e '+context.awayN+' partite delle due squadre.':'Dati insufficienti per una delle due squadre: nessuna probabilità generata.',
  context.homeOut===null?'Indisponibili: dato non fornito dal piano dati.':'Indisponibili mostrati a titolo informativo: il loro peso non è ancora nel calcolo.']};
}

// Stored results for the backtest (names are not needed there).
export async function storedResults():Promise<Result[]>{
 let row=await env.DB!.prepare("SELECT payload FROM model_state WHERE id='results'").first<{payload:string}>();
 if(!row){await buildModel();row=await env.DB!.prepare("SELECT payload FROM model_state WHERE id='results'").first<{payload:string}>();}
 const {comps,rows}=JSON.parse(row!.payload) as {comps:string[];rows:any[][]};
 return rows.map(([id,ts,c,homeId,awayId,hg,ag,season])=>({id,ts,comp:comps[c],homeId,awayId,hg,ag,season,home:String(homeId),away:String(awayId)}));
}
