import { env } from 'cloudflare:workers';
import { credentialValue } from './vault';
import { attackAdjustment, expectedCount, fitExtras, parseExtras, penaltyProbs, scorerProbs, type ExtraRow, type ExtrasModel } from './extras';
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
 const data=await pages('fixtures/date/'+date+'?include=participants;league.country;state;scores&timezone=Europe%2FRome');
 return data.filter(f=>!league||String(sportmonksCompetition(f.league)?.id)===league).map(sportmonksFixture).filter((m):m is Match=>m!==null);
}
type ModelState={builtAt:string;version:string;extras?:Record<string,ExtrasModel>;leagues:Record<string,LeagueModel>;tables:Record<string,TableRow[]>;forms:Record<string,string>;results:number};
let memo:{at:number;state:ModelState}|null=null;
// Builds the v2 model from ~13 months of results of the subscribed competitions and stores it in D1.
export async function buildModel():Promise<ModelState>{
 const now=Date.now(),results:Result[]=[],extraRows:ExtraRow[]=[],seen=new Set<number>();
 for(let w=0;w<4;w++){
  const end=new Date(now-86400000-w*99*86400000),start=new Date(end.getTime()-98*86400000);
  const data=await pages('fixtures/between/'+start.toISOString().slice(0,10)+'/'+end.toISOString().slice(0,10)+'?include=participants;scores;state;league.country;statistics;events',60);
  for(const f of data){const r=parseResult(f,sportmonksCompetition(f.league)?.name??null);if(r){results.push(r);if(!seen.has(r.id)){seen.add(r.id);extraRows.push({ts:r.ts,comp:r.comp,homeId:r.homeId,awayId:r.awayId,x:parseExtras(f)});}}}
 }
 const unique=[...new Map(results.map(r=>[r.id,r])).values()],extras:Record<string,ExtrasModel>={},leagues:Record<string,LeagueModel>={},tables:Record<string,TableRow[]>={},forms:Record<string,string>={};
 for(const comp of new Set(unique.map(r=>r.comp))){
  const rs=unique.filter(r=>r.comp===comp);
  if(comp!=='Coppa Italia'){const m=fitLeague(rs,now);if(m)leagues[comp]=m;extras[comp]=fitExtras(extraRows.filter(r=>r.comp===comp),now);}
  const season=rs.reduce((a,b)=>b.ts>a.ts?b:a).season;tables[comp]=table(rs,season);
 }
 const leagueOnly=unique.filter(r=>r.comp!=='Coppa Italia');
 for(const id of new Set(leagueOnly.flatMap(r=>[r.homeId,r.awayId])))forms[id]=form(leagueOnly,id,5);
 const state={builtAt:new Date().toISOString(),version:MODEL_V2,extras,leagues,tables,forms,results:unique.length};
 const comps=[...new Set(unique.map(r=>r.comp))],compact=unique.map(r=>[r.id,r.ts,comps.indexOf(r.comp),r.homeId,r.awayId,r.hg,r.ag,r.season]);
 await env.DB!.prepare('INSERT INTO model_state (id,built_at,payload) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET built_at=excluded.built_at,payload=excluded.payload').bind('results',state.builtAt,JSON.stringify({comps,rows:compact,names:Object.fromEntries(unique.flatMap(r=>[[r.homeId,r.home],[r.awayId,r.away]]))})).run();
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
// Current condition of a team: rest days, matches in the last 14 days, cup matches just before/after.
// Uses every fixture the data plan returns (domestic league, cups and, when covered, European cups).
export type Condition={rest:number|null;last14:number;nextDays:number|null;cups:string[];factor:number;notes:string[]};
async function teamCondition(teamId:number,kickoff:number,league:string):Promise<Condition|null>{
 const d=(t:number)=>new Date(t).toISOString().slice(0,10);
 let data:any[];try{data=(await feed('fixtures/between/'+d(kickoff-15*86400000)+'/'+d(kickoff+5*86400000)+'/'+teamId+'?include=league',6*3600)).data;}catch{return null;}
 if(!Array.isArray(data))return null;
 const ts=(f:any)=>f.starting_at_timestamp*1000,before=data.filter(f=>ts(f)<kickoff-3600000&&ts(f)>=kickoff-14*86400000).sort((a,b)=>ts(b)-ts(a)),after=data.filter(f=>ts(f)>kickoff+3600000).sort((a,b)=>ts(a)-ts(b));
 const rest=before.length?(kickoff-ts(before[0]))/86400000:null,nextDays=after.length?(ts(after[0])-kickoff)/86400000:null;
 const cups=[...new Set([...before.slice(0,2),...after.slice(0,1)].map(f=>f.league?.name).filter((n:any)=>n&&n!==league&&!(league==='Serie A'&&/serie a/i.test(n))))] as string[];
 let factor=1;const notes:string[]=[];
 if(rest!==null&&rest<3.5){factor*=0.97;notes.push('Ha giocato '+Math.round(rest*24)+' ore fa');}
 if(before.length>=4){factor*=0.98;notes.push(before.length+' partite negli ultimi 14 giorni');}
 if(nextDays!==null&&nextDays<3.5&&after[0]?.league?.name&&after[0].league.name!==league){factor*=0.985;notes.push('Tra '+Math.round(nextDays)+' giorni gioca '+after[0].league.name+': possibile turnover');}
 return {rest:rest===null?null:Math.round(rest*10)/10,last14:before.length,nextDays:nextDays===null?null:Math.round(nextDays*10)/10,cups,factor:Math.max(0.94,factor),notes};
}
export async function getSportmonksMatch(id:string):Promise<Match>{
 if(!/^sm-\d{1,12}$/.test(id))throw new Error('Partita Sportmonks non valida.');
 let f:any;
 try{f=(await feed('fixtures/'+id.slice(3)+'?include=participants;league.country;state;sidelined.player;sidelined.type;lineups',300)).data;}
 catch{try{f=(await feed('fixtures/'+id.slice(3)+'?include=participants;league.country;state;sidelined.player;sidelined.type',300)).data;}
 catch{f=(await feed('fixtures/'+id.slice(3)+'?include=participants;league.country;state',300)).data;}}
 const m=sportmonksFixture(f);
 if(!m)throw new Error('Competizione o dati Sportmonks non supportati.');
 if(f.state?.state!=='NS'||new Date(m.kickoff).getTime()<=Date.now())throw new Error('Il modello analizza solo partite non iniziate.');
 const state=await getModel(),h=f.participants.find((x:any)=>x.meta?.location==='home'),a=f.participants.find((x:any)=>x.meta?.location==='away');
 const league=state.leagues[m.competition==='Coppa Italia'?'Serie A':m.competition],l0=league?lambdas(league,h.id,a.id):null;
 // Absences and official line-ups (Sportmonks lineups: type 11 = starting XI) adjust each team's expected goals.
 const exAdj=state.extras?.[m.competition==='Coppa Italia'?'Serie A':m.competition];
 const absentIds=(teamId:number)=>new Set<number>(Array.isArray(f.sidelined)?f.sidelined.filter((s:any)=>(s.participant_id??s.sideline?.team_id)===teamId&&s.sideline?.completed!==true).map((s:any)=>s.player_id??s.sideline?.player_id).filter((x:any)=>Number.isInteger(x)):[]);
 const starterIds=(teamId:number)=>{if(!Array.isArray(f.lineups))return null;const st=f.lineups.filter((x:any)=>x.team_id===teamId&&x.type_id===11).map((x:any)=>x.player_id);return st.length>=11?new Set<number>(st):null;};
 const sh=starterIds(h.id),sa=starterIds(a.id),adjH=attackAdjustment(exAdj?.scorers[h.id],absentIds(h.id),sh),adjA=attackAdjustment(exAdj?.scorers[a.id],absentIds(a.id),sa);
 const kickTs=f.starting_at_timestamp*1000,[condH,condA]=await Promise.all([teamCondition(h.id,kickTs,m.competition),teamCondition(a.id,kickTs,m.competition)]);
 const l=l0?{lh:l0.lh*adjH.factor*(condH?.factor??1),la:l0.la*adjA.factor*(condA?.factor??1)}:null;
 const tbl=state.tables[m.competition==='Coppa Italia'?'Serie A':m.competition]||[],ph=tbl.find(r=>r.teamId===h.id),pa=tbl.find(r=>r.teamId===a.id);
 const context={model:state.version,rho:league?.rho??0,homePos:ph?.position??null,awayPos:pa?.position??null,homePts:ph?.points??null,awayPts:pa?.points??null,teamsInTable:tbl.length,homeForm:state.forms[h.id]||'',awayForm:state.forms[a.id]||'',homeOut:sidelinedNames(f,h.id),awayOut:sidelinedNames(f,a.id),homeN:league?.teams[h.id]?.n??0,awayN:league?.teams[a.id]?.n??0,lineupConfirmed:Boolean(sh&&sa),adjust:{home:adjH,away:adjA},condition:{home:condH,away:condA}};
 const ex=state.extras?.[m.competition==='Coppa Italia'?'Serie A':m.competition];
 let counts:Match['counts'];
 if(ex){const c=expectedCount(ex.corners,h.id,a.id),y=expectedCount(ex.yellow,h.id,a.id),r=expectedCount(ex.red,h.id,a.id);if(c&&y&&r)counts={corners:c,yellow:y,red:r};
  const pen=penaltyProbs(ex,h.id,a.id);if(pen)(context as any).penalties=pen;
  if(l){const benchCut=(list:{id:number;name:string;p:number}[],st:Set<number>|null)=>list.map(x=>st&&!st.has(x.id)?{...x,p:x.p*0.35}:x).sort((x,y)=>y.p-x.p);
   (context as any).scorers={home:benchCut(scorerProbs(ex,h.id,l.lh,context.homeOut),sh),away:benchCut(scorerProbs(ex,a.id,l.la,context.awayOut),sa)};}}
 return {...m,counts,sampleHome:context.homeN,sampleAway:context.awayN,lambdaHome:l?l.lh:null,lambdaAway:l?l.la:null,context,notes:[
  'Modello v2: forza di attacco e difesa di ogni squadra stimata su tutte le partite del campionato degli ultimi 13 mesi circa ('+state.results+' risultati), con peso maggiore alle più recenti (metà peso dopo 250 giorni), calibrato con backtest.',
  'Include fattore campo del campionato e correzione Dixon–Coles sui risultati bassi. Punteggio dopo i 90 minuti.',
  l?'Stima basata su '+context.homeN+' e '+context.awayN+' partite delle due squadre.':'Dati insufficienti per una delle due squadre: nessuna probabilità generata.',
  context.homeOut===null?'Indisponibili: dato non fornito dal piano dati.':'Assenze nel calcolo: i gol attesi scendono in base alla quota di gol dei marcatori assenti (massimo −25%).',
  sh&&sa?'Formazioni ufficiali confermate: i marcatori in panchina pesano meno.':'Formazioni ufficiali non ancora pubblicate: ricalcolo automatico circa un’ora prima del calcio d’inizio.']};
}

// Stored results for the backtest (names are not needed there).
export async function storedResults():Promise<Result[]>{
 let row=await env.DB!.prepare("SELECT payload FROM model_state WHERE id='results'").first<{payload:string}>();
 if(!row){await buildModel();row=await env.DB!.prepare("SELECT payload FROM model_state WHERE id='results'").first<{payload:string}>();}
 const {comps,rows,names}=JSON.parse(row!.payload) as {comps:string[];rows:any[][];names?:Record<string,string>};
 return rows.map(([id,ts,c,homeId,awayId,hg,ag,season])=>({id,ts,comp:comps[c],homeId,awayId,hg,ag,season,home:names?.[homeId]??String(homeId),away:names?.[awayId]??String(awayId)}));
}
// Final facts of a fixture for settlement. 'void' for cancelled/abandoned matches or postponed by more than 3 days.
export async function fixtureFinal(id:string):Promise<{status:'final'|'void'|'pending';final?:import('./settle-contract').Final}>{
 if(!/^sm-\d{1,12}$/.test(id))return {status:'pending'};
 const f=(await feed('fixtures/'+id.slice(3)+'?include=participants;scores;state;statistics;events',120)).data,st=f?.state?.state;
 if(['FT','AET','FT_PEN'].includes(st)){
  const r=parseResult(f,'x');if(!r)return {status:'pending'};
  const x=parseExtras(f);
  return {status:'final',final:{hg:r.hg,ag:r.ag,corners:x.corners,yellow:x.yellow,red:x.red,penAwarded:x.penAwarded,penMissed:x.penMissed,scorers:x.scorers?x.scorers.map(s=>s.id):null}};
 }
 const late=Number.isFinite(f?.starting_at_timestamp)&&Date.now()-f.starting_at_timestamp*1000>3*86400000;
 if(['CANCL','ABAN','AWARDED','WO','DELETED'].includes(st)||(late&&['POSTP','SUSP','INT','TBA','NS'].includes(st)))return {status:'void'};
 return {status:'pending'};
}

// ---- Classifiche ufficiali e formazioni ----
export const STANDING_LEAGUES:[number,string,string][]=[[384,'Serie A','🇮🇹'],[8,'Premier League','🏴'],[564,'La Liga','🇪🇸'],[82,'Bundesliga','🇩🇪'],[301,'Ligue 1','🇫🇷'],[387,'Serie B','🇮🇹'],[9,'Championship','🏴']];
export type StandingRow={position:number;teamId:number;name:string;logo:string|null;played:number|null;won:number|null;draw:number|null;lost:number|null;gf:number|null;ga:number|null;points:number;form:string};
const DETAIL:Record<string,keyof StandingRow>={OVERALL_MATCHES:'played',OVERALL_WINS:'won',OVERALL_DRAWS:'draw',OVERALL_LOST:'lost',OVERALL_SCORED:'gf',OVERALL_CONCEDED:'ga'};
const DETAIL_ID:Record<number,keyof StandingRow>={129:'played',130:'won',131:'draw',132:'lost',133:'gf',134:'ga'};
export async function leagueStandings(id:number,name:string):Promise<{league:string;rows:StandingRow[];source:'ufficiale'|'calcolata'}>{
 let state:ModelState|null=null;try{state=await getModel();}catch{}
 const forms=state?.forms||{},calc=state?.tables[name]||[];
 let d:any=null;
 for(const inc of ['participant;details.type','participant;details','participant']){try{d=await feed('standings/live/leagues/'+id+'?include='+inc,1800);break;}catch{}}
 const list=Array.isArray(d?.data)?d.data:[];
 if(list.length){
  const rows=list.map((s:any):StandingRow=>{const c=calc.find(r=>r.teamId===s.participant_id),row:StandingRow={position:s.position,teamId:s.participant_id,name:s.participant?.name||c?.name||'?',logo:s.participant?.image_path||null,played:c?.played??null,won:null,draw:null,lost:null,gf:c?.gf??null,ga:c?.ga??null,points:s.points,form:forms[s.participant_id]||''};
   for(const x of Array.isArray(s.details)?s.details:[]){const k=DETAIL[x.type?.developer_name]||DETAIL_ID[x.type_id];if(k)(row as any)[k]=x.value;}
   return row;}).sort((a:StandingRow,b:StandingRow)=>a.position-b.position);
  return {league:name,rows,source:'ufficiale'};
 }
 return {league:name,rows:calc.map(r=>({position:r.position,teamId:r.teamId,name:r.name,logo:null,played:r.played,won:null,draw:null,lost:null,gf:r.gf,ga:r.ga,points:r.points,form:forms[r.teamId]||''})),source:'calcolata'};
}
export async function allStandings(){
 const out=[];for(const [id,name,flag] of STANDING_LEAGUES){try{out.push({...(await leagueStandings(id,name)),flag});}catch(e){out.push({league:name,flag,rows:[],source:'calcolata' as const,error:e instanceof Error?e.message:'Errore'});}}
 return {leagues:out,at:new Date().toISOString()};
}
// Matches of today and the next two days with crests.
export async function lineupFixtures(){
 const out:any[]=[];
 for(let i=0;i<3;i++){const day=new Date(Date.now()+i*86400000).toLocaleDateString('en-CA',{timeZone:'Europe/Rome'});
  let data:any[]=[];try{data=await pages('fixtures/date/'+day+'?include=participants;league.country;state&timezone=Europe%2FRome',3);}catch{continue;}
  for(const f of data){const c=sportmonksCompetition(f.league);if(!c)continue;const h=f.participants?.find((x:any)=>x.meta?.location==='home'),a=f.participants?.find((x:any)=>x.meta?.location==='away');if(!h||!a)continue;
   out.push({id:'sm-'+f.id,competition:c.name,kickoff:new Date(f.starting_at_timestamp*1000).toISOString(),state:f.state?.state||'NS',home:h.name,away:a.name,homeLogo:h.image_path||null,awayLogo:a.image_path||null});}}
 return out.sort((a,b)=>a.kickoff.localeCompare(b.kickoff));
}
export async function fixtureLineup(id:string){
 if(!/^sm-\d{1,12}$/.test(id))throw new Error('Partita non valida.');
 let f:any=null;
 for(const inc of ['participants;league.country;state;lineups.player;lineups.position;formations;coaches','participants;league.country;state;lineups;formations','participants;league.country;state;lineups']){try{f=(await feed('fixtures/'+id.slice(3)+'?include='+inc,180)).data;break;}catch{}}
 if(!f)throw new Error('Formazioni non disponibili per questa partita.');
 const side=(loc:'home'|'away')=>{const p=f.participants?.find((x:any)=>x.meta?.location===loc);if(!p)return null;
  const ls=(Array.isArray(f.lineups)?f.lineups:[]).filter((x:any)=>x.team_id===p.id);
  const pl=(x:any)=>({name:x.player?.display_name||x.player_name||x.player?.name||'?',number:x.jersey_number??null,field:x.formation_field||null,pos:x.position?.code||x.position?.name||null,photo:x.player?.image_path||null});
  const starters=ls.filter((x:any)=>x.type_id===11).sort((a:any,b:any)=>(a.formation_position??99)-(b.formation_position??99)).map(pl),bench=ls.filter((x:any)=>x.type_id===12).map(pl);
  const formation=(Array.isArray(f.formations)?f.formations:[]).find((x:any)=>x.participant_id===p.id||x.location===loc)?.formation||null;
  const coach=(Array.isArray(f.coaches)?f.coaches:[]).find((x:any)=>x.meta?.participant_id===p.id);
  return {name:p.name,logo:p.image_path||null,formation,starters,bench,coach:coach?.display_name||coach?.name||null};};
 const home=side('home'),away=side('away'),c=sportmonksCompetition(f.league);
 return {id,competition:c?.name||f.league?.name||'',kickoff:new Date(f.starting_at_timestamp*1000).toISOString(),state:f.state?.state||'NS',home,away,confirmed:Boolean(home&&home.starters.length>=11&&away&&away.starters.length>=11)};
}
