export const oddsMarketLabel=(key:string)=>({h2h:'1X2',totals:'Over / Under gol',spreads:'Handicap',btts:'Goal / No Goal',correct_score:'Risultato esatto',h2h_corners:'1X2 corner',totals_corners:'Over / Under corner',alternate_totals_corners:'Linee alternative corner',totals_cards:'Over / Under cartellini',alternate_totals_cards:'Linee alternative cartellini'}[key]||key.replace(/_/g,' '));
export function cleanOddsEvent(data:any){
 if(!data||typeof data.id!=='string'||typeof data.home_team!=='string'||typeof data.away_team!=='string'||!Number.isFinite(Date.parse(data.commence_time)))throw new Error('Evento quote non valido.');
 return {id:data.id,home:data.home_team,away:data.away_team,kickoff:data.commence_time};
}
export function cleanOddsQuotes(data:any){
 const event=cleanOddsEvent(data);const quotes:any[]=[];
 for(const b of data.bookmakers||[])for(const m of b.markets||[])for(const o of m.outcomes||[]){
  if(typeof b.title!=='string'||typeof m.key!=='string'||typeof o.name!=='string'||!Number.isFinite(o.price)||o.price<=1||!Number.isFinite(Date.parse(m.last_update||b.last_update)))continue;
  quotes.push({bookmaker:b.title,market:m.key,marketLabel:oddsMarketLabel(m.key),outcome:o.name,description:typeof o.description==='string'?o.description:null,line:typeof o.point==='number'&&Number.isFinite(o.point)?o.point:null,price:o.price,updatedAt:m.last_update||b.last_update});
 }
 return {event,quotes};
}
