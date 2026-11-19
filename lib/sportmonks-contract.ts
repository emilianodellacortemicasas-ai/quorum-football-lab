import type { Match } from './types';
const norm=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
export function sportmonksCompetition(league:any):{id:number;name:string;group:string}|null{
 const n=norm(league?.name||''),country=norm(league?.country?.name||'');
 const domestic:Record<string,Record<string,[number,string,string]>>={
  england:{premierleague:[39,'Premier League','Inghilterra']},
  italy:{seriea:[135,'Serie A','Italia'],coppaitalia:[137,'Coppa Italia','Italia']},
  germany:{bundesliga:[78,'Bundesliga','Germania']},
  spain:{laliga:[140,'La Liga','Spagna'],laligaeasports:[140,'La Liga','Spagna']},
  france:{ligue1:[61,'Ligue 1','Francia'],ligue1mcdonalds:[61,'Ligue 1','Francia']}
 };
 const international:Record<string,[number,string,string]>={}; // Coppe europee e nazionali fuori perimetro (Starter + 1 lega extra).
 const v=domestic[country]?.[n]||((country==='europe'||country==='world')?international[n]:undefined);
 return v?{id:v[0],name:v[1],group:v[2]}:null;
}
export function sportmonksFixture(f:any):Match|null{
 const c=sportmonksCompetition(f.league),h=f.participants?.find((x:any)=>x.meta?.location==='home'),a=f.participants?.find((x:any)=>x.meta?.location==='away');
 if(!c||!h?.name||!a?.name||!Number.isSafeInteger(f.id)||!Number.isFinite(f.starting_at_timestamp))return null;
 return {id:'sm-'+f.id,home:h.name,away:a.name,homeCode:(h.short_code||h.name.slice(0,3)).toUpperCase(),awayCode:(a.short_code||a.name.slice(0,3)).toUpperCase(),homeColor:'#285c58',awayColor:'#686981',competition:c.name,group:c.group,kickoff:new Date(f.starting_at_timestamp*1000).toISOString(),lambdaHome:null,lambdaAway:null,sampleHome:0,sampleAway:0,source:'live',odds:{},notes:['Fonte Sportmonks. Apri la partita per verificare il campione storico disponibile.']};
}
export function historicalGoalMeans(fixtures:any[],teamId:number,side:'home'|'away',cutoff:number){
 const seen=new Set<number>();const valid:{for:number;against:number}[]=[];
 for(const f of [...fixtures].sort((a,b)=>b.starting_at_timestamp-a.starting_at_timestamp)){
  if(seen.has(f.id)||!Number.isFinite(f.starting_at_timestamp)||f.starting_at_timestamp*1000>=cutoff||!['FT','AET','FT_PEN'].includes(f.state?.state))continue;
  const participant=f.participants?.find((x:any)=>x.id===teamId);if(participant?.meta?.location!==side)continue;
  // 2ND_HALF is cumulative after 90 minutes. CURRENT can include extra time.
  const s=f.scores?.filter((x:any)=>x.description==='2ND_HALF');
  const own=s?.find((x:any)=>x.score?.participant===side)?.score?.goals,opp=s?.find((x:any)=>x.score?.participant===(side==='home'?'away':'home'))?.score?.goals;
  if(!Number.isInteger(own)||!Number.isInteger(opp)||own<0||opp<0||own>20||opp>20)continue;
  seen.add(f.id);valid.push({for:own,against:opp});if(valid.length===20)break;
 }
 return {sample:valid.length,for:valid.length?valid.reduce((s,x)=>s+x.for,0)/valid.length:null,against:valid.length?valid.reduce((s,x)=>s+x.against,0)/valid.length:null};
}
