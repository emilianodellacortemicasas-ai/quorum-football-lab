import { credentialValue } from './vault';
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
async function pages(path:string){const out:any[]=[];for(let page=1;page<=5;page++){const d=await feed(path+(path.includes('?')?'&':'?')+'per_page=50&page='+page);if(!Array.isArray(d.data))throw new Error('Formato dei dati Sportmonks non riconosciuto.');out.push(...d.data);if(!d.pagination?.has_more)return out;}throw new Error('Troppi risultati Sportmonks per questa selezione. Restringi la data.');}
export async function getSportmonksFixtures(date:string,league?:string):Promise<Match[]>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Data non valida.');
 const data=await pages('fixtures/date/'+date+'?include=participants;league.country;state&timezone=Europe%2FRome');
 return data.filter(f=>!league||String(sportmonksCompetition(f.league)?.id)===league).map(sportmonksFixture).filter((m):m is Match=>m!==null);
}
export async function getSportmonksMatch(id:string):Promise<Match>{
 if(!/^sm-\d{1,12}$/.test(id))throw new Error('Partita Sportmonks non valida.');
 const f=(await feed('fixtures/'+id.slice(3)+'?include=participants;league.country;state',120)).data,m=sportmonksFixture(f);
 if(!m)throw new Error('Competizione o dati Sportmonks non supportati.');
 if(f.state?.state!=='NS'||new Date(m.kickoff).getTime()<=Date.now())throw new Error('Il modello analizza solo partite non iniziate.');
 const cutoff=Math.min(new Date(m.kickoff).getTime(),Date.now()),end=new Date(cutoff-86400000),start=new Date(cutoff-99*86400000);
 const histories=await Promise.all(['home','away'].map(async side=>{const team=f.participants.find((x:any)=>x.meta?.location===side);const fixtures=await pages('fixtures/between/'+start.toISOString().slice(0,10)+'/'+end.toISOString().slice(0,10)+'/'+team.id+'?include=participants;scores;state');return historicalGoalMeans(fixtures,team.id,side as 'home'|'away',cutoff);}));
 const [h,a]=histories,lh=h.for!==null&&a.against!==null?Math.sqrt(h.for*a.against):null,la=a.for!==null&&h.against!==null?Math.sqrt(a.for*h.against):null;
 const valid=h.sample>=5&&a.sample>=5&&lh!==null&&la!==null&&lh>0&&la>0&&lh<=6&&la<=6;
 return {...m,sampleHome:h.sample,sampleAway:a.sample,lambdaHome:valid?lh:null,lambdaAway:valid?la:null,notes:['Fonte Sportmonks · ultimi 100 giorni, fino a 20 incontri conclusi per squadra, separati casa/trasferta.','Si usa il punteggio dopo i 90 minuti; supplementari e rigori esclusi.',valid?'Stima sperimentale da medie gol osservate.':'Campione insufficiente o incoerente: nessuna probabilità viene generata.','Non include ancora xG, infortuni, formazioni o calibrazione. Corner e cartellini richiedono un modello separato.']};
}
