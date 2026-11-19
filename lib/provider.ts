import { credentialExists, credentialValue } from './vault';
import { competitions } from './demo';
import type { Match } from './types';
import { getSportmonksFixtures,getSportmonksMatch } from './sportmonks';

type Feed = {response:any[]; errors:any; results:number};
const cache = new Map<string,{until:number;data:Feed}>();
export const hasFootballKey = async () => (await Promise.all([credentialExists('api-football'),credentialExists('sportmonks')])).some(Boolean);
export const clearFootballCache=()=>cache.clear();
async function feed(path:string, seconds=300):Promise<Feed> {
  const apiKey=await credentialValue('api-football');
  if(!apiKey) throw new Error('Dati reali non collegati.');
  const cached=cache.get(path);if(cached && cached.until>Date.now())return cached.data;
  const response=await fetch('https://v3.football.api-sports.io/'+path,{headers:{'x-apisports-key':apiKey},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Fornitore dati non disponibile.');
  const data=await response.json() as Feed;
  if(Object.keys(data.errors || {}).length)throw new Error('Il piano dati non consente questa richiesta o ha esaurito la quota.');
  if(cache.size>300)cache.clear();cache.set(path,{until:Date.now()+seconds*1000,data});return data;
}
export async function getFixtures(date:string, league?:string, provider='auto'):Promise<Match[]> {
  if(!['auto','api-football','sportmonks'].includes(provider))throw new Error('Fornitore non valido.');
  if(provider==='sportmonks'||provider==='auto'&&await credentialExists('sportmonks'))return getSportmonksFixtures(date,league);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Data non valida.');
  if(league && !competitions.some(c=>String(c.id)===league))throw new Error('Competizione non supportata.');
  const data=await feed('fixtures?date='+date+'&timezone=Europe%2FRome'+(league?'&league='+league:''),300);
  return data.response.filter((f:any)=>competitions.some(c=>c.id===f.league.id)).map((f:any)=>{
    const competition=competitions.find(c=>c.id===f.league.id)!;
    return {id:String(f.fixture.id),home:f.teams.home.name,away:f.teams.away.name,homeCode:f.teams.home.name.slice(0,3).toUpperCase(),awayCode:f.teams.away.name.slice(0,3).toUpperCase(),homeColor:'#285c58',awayColor:'#686981',competition:competition.name,group:competition.group,kickoff:f.fixture.date,lambdaHome:null,lambdaAway:null,sampleHome:0,sampleAway:0,source:'live' as const,odds:{},notes:['Calendario reale. Apri la partita per verificare i dati del modello.']};
  });
}
export async function getLiveMatch(id:string):Promise<Match> {
  if(id.startsWith('sm-'))return getSportmonksMatch(id);
  if(!/^\d{1,12}$/.test(id))throw new Error('Partita non valida.');
  const fixture=(await feed('fixtures?id='+id,120)).response[0];
  if(!fixture)throw new Error('Partita non trovata.');
  const competition=competitions.find(c=>c.id===fixture.league.id);
  if(!competition)throw new Error('Competizione non supportata.');
  if(fixture.fixture.status.short!=='NS' || new Date(fixture.fixture.date).getTime()<=Date.now())throw new Error('Il modello v0.1 analizza solo partite non iniziate.');
  const base='teams/statistics?league='+fixture.league.id+'&season='+fixture.league.season+'&team=';
  const responses=await Promise.all([feed(base+fixture.teams.home.id,3600),feed(base+fixture.teams.away.id,3600)]);
  const h=responses[0].response as any,a=responses[1].response as any;
  const sampleHome=Number(h?.fixtures?.played?.home || 0), sampleAway=Number(a?.fixtures?.played?.away || 0);
  const values=[h?.goals?.for?.average?.home,a?.goals?.against?.average?.away,a?.goals?.for?.average?.away,h?.goals?.against?.average?.home].map(Number);
  const adequate=sampleHome>=5 && sampleAway>=5 && values.every(v=>Number.isFinite(v)&&v>=0);
  const lh=adequate?Math.sqrt(values[0]*values[1]):null,la=adequate?Math.sqrt(values[2]*values[3]):null;
  const valid=lh!==null&&la!==null&&lh>0&&la>0&&lh<=6&&la<=6;
  return {id,home:fixture.teams.home.name,away:fixture.teams.away.name,homeCode:fixture.teams.home.name.slice(0,3).toUpperCase(),awayCode:fixture.teams.away.name.slice(0,3).toUpperCase(),homeColor:'#285c58',awayColor:'#686981',competition:competition.name,group:competition.group,kickoff:fixture.fixture.date,lambdaHome:valid?lh:null,lambdaAway:valid?la:null,sampleHome,sampleAway,source:'live',odds:{},notes:[valid?'Stima sperimentale da medie gol in casa/trasferta della stagione corrente.':'Campione insufficiente: probabilità non calcolate.', 'Non include xG, formazioni, infortuni, forza avversari o correzione Dixon–Coles. Quote da inserire manualmente e verificare.','Previsioni sui 90 minuti più recupero; esclusi supplementari e rigori.']};
}
