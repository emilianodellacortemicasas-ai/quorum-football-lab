import type { Bet, Portfolio, Selection, Match } from './types';
export const MODEL_VERSION = 'poisson-independent-v0.1';
export const money = (cents: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
export const percent = (p: number, digits = 1) => (p * 100).toLocaleString('it-IT', { maximumFractionDigits: digits, minimumFractionDigits: digits }) + '%';
export function poisson(lambda: number, max = 24) {
  if (!Number.isFinite(lambda) || lambda < 0 || lambda > 6) throw new Error('Parametro gol fuori intervallo.');
  const values = [Math.exp(-lambda)];
  for (let k = 1; k <= max; k++) values.push(values[k - 1] * lambda / k);
  return values;
}
export function analyze(lambdaHome: number, lambdaAway: number) {
  const h = poisson(lambdaHome), a = poisson(lambdaAway);
  const scores: { home: number; away: number; p: number }[] = [];
  const markets: Record<string, number> = { home: 0, draw: 0, away: 0, over15: 0, over25: 0, over35: 0, btts: 0 };
  const mass = h.reduce((x, y) => x + y, 0) * a.reduce((x, y) => x + y, 0);
  for (let i = 0; i < h.length; i++) for (let j = 0; j < a.length; j++) {
    const p = h[i] * a[j] / mass;
    scores.push({ home: i, away: j, p });
    markets[i > j ? 'home' : i === j ? 'draw' : 'away'] += p;
    if (i + j >= 2) markets.over15 += p;
    if (i + j >= 3) markets.over25 += p;
    if (i + j >= 4) markets.over35 += p;
    if (i > 0 && j > 0) markets.btts += p;
    markets['exact:' + i + '-' + j] = p;
  }
  Object.assign(markets, { under15: 1 - markets.over15, under25: 1 - markets.over25, under35: 1 - markets.over35, noGoal: 1 - markets.btts, homeDraw: markets.home + markets.draw, drawAway: markets.draw + markets.away, homeAway: markets.home + markets.away });
  scores.sort((x, y) => y.p - x.p);
  return { markets, scores, mass };
}
export const marketLabel = (key: string): string => {
  const parts=key.split(':');
  if(['corners','yellow','red','teamGoals'].includes(parts[0]))return ({corners:'Corner',yellow:'Gialli',red:'Rossi',teamGoals:'Gol'}[parts[0]]||'')+' '+({total:'totali',home:'casa',away:'ospite'}[parts[1]]||'')+' · '+(parts[2]==='over'?'Over ':'Under ')+parts[3].replace('.',',');
  return ({home:'1 · Casa',draw:'X · Pareggio',away:'2 · Ospite',over15:'Over 1,5',under15:'Under 1,5',over25:'Over 2,5',under25:'Under 2,5',over35:'Over 3,5',under35:'Under 3,5',btts:'Goal',noGoal:'No Goal',homeDraw:'Doppia chance 1X',drawAway:'Doppia chance X2',homeAway:'Doppia chance 12'}[key] || (key.startsWith('exact:') ? 'Risultato esatto ' + key.slice(6) : key));
};
export function negativeBinomialCdf(mean:number,shape:number,max:number) {
  if(!Number.isFinite(mean)||mean<0||!Number.isFinite(shape)||shape<=0||!Number.isInteger(max)||max<0||max>100)throw new Error('Parametri di conteggio non validi.');
  const q=mean/(shape+mean);let pk=Math.pow(shape/(shape+mean),shape),sum=pk;
  for(let k=1;k<=max;k++){pk*=((k-1+shape)/k)*q;sum+=pk;}return Math.max(0,Math.min(1,sum));
}
export function analyzeMatch(m:Match){
  if(m.lambdaHome===null||m.lambdaAway===null)return null;
  const a=analyze(m.lambdaHome,m.lambdaAway);
  for(const [index,lambda] of [m.lambdaHome,m.lambdaAway].entries()){
    const dist=poisson(lambda);
    for(const line of [.5,1.5,2.5,3.5,4.5]){
      const under=dist.slice(0,Math.floor(line)+1).reduce((s,p)=>s+p,0),prefix='teamGoals:'+(index===0?'home':'away')+':';
      a.markets[prefix+'under:'+line]=under;a.markets[prefix+'over:'+line]=1-under;
    }
  }
  for(const line of [.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5]){const under=a.scores.filter(s=>s.home+s.away<=Math.floor(line)).reduce((v,s)=>v+s.p,0);a.markets['teamGoals:total:under:'+line]=under;a.markets['teamGoals:total:over:'+line]=1-under;}
  if(m.counts)for(const family of ['corners','yellow','red'] as const){
    const lines=Array.from({length:family==='corners'?21:family==='yellow'?11:4},(_,i)=>i+.5);
    for(const side of ['total','home','away'] as const){
      const mean=side==='total'?m.counts[family][0]+m.counts[family][1]:m.counts[family][side==='home'?0:1],shape=family==='corners'?12:family==='yellow'?6:2;
      for(const line of lines){const under=negativeBinomialCdf(mean,shape,Math.floor(line)),prefix=family+':'+side+':';a.markets[prefix+'under:'+line]=under;a.markets[prefix+'over:'+line]=1-under;}
    }
  }
  return a;
}
export function impliedNoMargin(odds: number[]) {
  if (odds.some(o => !Number.isFinite(o) || o <= 1)) throw new Error('Quote non valide.');
  const weights = odds.map(o => 1 / o), overround = weights.reduce((a, b) => a + b, 0);
  return { probabilities: weights.map(w => w / overround), margin: overround - 1 };
}
const dateRome = (s: string) => new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Rome', year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
export function portfolioMetrics(portfolio: Portfolio, bets: Bet[], now = new Date()) {
  const rows = bets.filter(b => b.portfolioId === portfolio.id);
  const settled = rows.filter(b => ['won', 'lost', 'void'].includes(b.status)).sort((a,b) => (a.settledAt || a.createdAt).localeCompare(b.settledAt || b.createdAt));
  let equity = portfolio.initialCents, peak = equity, maxDrawdown = 0;
  const curve = [equity];
  for (const bet of settled) { equity += bet.pnlCents; peak = Math.max(peak, equity); maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - equity) / peak : 0); curve.push(equity); }
  const pending = rows.filter(b => b.status === 'pending'), openCents = pending.reduce((s,b) => s + b.stakeCents, 0);
  const counted = settled.filter(b => b.status !== 'void'), stakeCents = counted.reduce((s,b) => s + b.stakeCents, 0);
  const today = dateRome(now.toISOString()), todayRows = settled.filter(b => dateRome(b.settledAt || b.createdAt) === today);
  const todayPnl = todayRows.reduce((s,b) => s + b.pnlCents, 0), dayStartCents = equity - todayPnl, dayLossCents = Math.max(0, -todayPnl);
  return {equity, peak, availableCents: Math.max(0,equity-openCents), openCents, pnlCents:equity-portfolio.initialCents, maxDrawdown, drawdown: peak > 0 ? (peak-equity)/peak : 0, stakeCents, roi:stakeCents ? (equity-portfolio.initialCents)/stakeCents : null, hitRate:counted.length ? counted.filter(b=>b.status==='won').length/counted.length : null, settledCount:counted.length, todayPnl,dayStartCents,dayLossCents,pendingCount:pending.length,curve};
}
export function riskCheck(portfolio: Portfolio, bets: Bet[], stakeCents: number, now = new Date()) {
  const m = portfolioMetrics(portfolio,bets,now), reasons: string[] = [];
  const singleCap = Math.floor(m.equity * portfolio.stakeBps / 10000), openCap = Math.floor(m.equity * portfolio.exposureBps / 10000), dayCap = Math.floor(m.dayStartCents * portfolio.dayBps / 10000);
  if (!Number.isSafeInteger(stakeCents) || stakeCents <= 0) reasons.push('Inserisci un importo positivo in centesimi.');
  // Money-management rules are optional per portfolio; the available-capital check is accounting and always applies.
  const rules = portfolio.limitsEnabled !== false;
  if (rules && stakeCents > singleCap) reasons.push('Superato il limite per singola operazione.');
  if (rules && m.openCents + stakeCents > openCap) reasons.push('Superata l’esposizione massima aperta.');
  if (rules && m.dayLossCents + m.openCents + stakeCents > dayCap) reasons.push('Superato il budget di perdita della giornata, incluse le operazioni aperte.');
  if (stakeCents > m.availableCents) reasons.push('Disponibilità insufficiente.');
  if (rules && m.drawdown >= portfolio.drawdownBps / 10000) reasons.push('Stop drawdown raggiunto: sospendi e rivedi il metodo.');
  return {...m, singleCap, openCap, dayCap, reasons, allowed:reasons.length===0};
}
export function settlementPnl(stakeCents: number, odds: number, status: string) {
  if (status === 'won') return Math.round(stakeCents * (odds - 1));
  if (status === 'lost') return -stakeCents;
  if (status === 'void') return 0;
  throw new Error('Esito non valido.');
}
export function combinations(n: number, k: number): number[][] {
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 1 || k > n) throw new Error('Sistema non valido.');
  const result: number[][] = [];
  const visit = (start:number, a:number[]) => { if(a.length === k) {result.push(a);return;} for(let i = start;i < n;i++) visit(i+1,[...a,i]); }; visit(0,[]);return result;
}
export function evaluateSystem(selections: Selection[], k: number, unitCents: number) {
  if (selections.length > 8 || selections.length < 1) throw new Error('Scegli da 1 a 8 eventi.');
  if(selections.some(s=>/^sm-\d+$/.test(s.fixtureId))&&selections.some(s=>/^\d+$/.test(s.fixtureId)))throw new Error('Usa una sola fonte calcistica per sistema: gli identificativi tra fornitori non sono ancora riconciliati.');
  if (new Set(selections.map(s=>s.fixtureId)).size !== selections.length) throw new Error('Usa un solo esito per partita: gli esiti della stessa partita sono correlati.');
  if (!Number.isSafeInteger(unitCents) || unitCents < 1 || selections.some(s=>!Number.isFinite(s.p)||s.p<=0||s.p>=1||!Number.isFinite(s.odds)||s.odds<=1)) throw new Error('Probabilità, quote o importo non validi.');
  const tickets=combinations(selections.length,k), costCents=tickets.length*unitCents;
  const payout=(mask:number)=>tickets.reduce((sum,t)=>sum+(t.every(i=>mask & (1<<i))?Math.round(unitCents*t.reduce((o,i)=>o*selections[i].odds,1)):0),0);
  let pWin=0,pProfit=0,expectedCents=0;
  const scenarios:{p:number;netCents:number}[]=[];
  for(let mask=0;mask<(1<<selections.length);mask++){
    const p=selections.reduce((v,s,i)=>v*((mask & (1<<i))?s.p:1-s.p),1), returns=payout(mask),netCents=returns-costCents;
    if(returns>0)pWin+=p; if(netCents>0)pProfit+=p; expectedCents+=p*netCents;scenarios.push({p,netCents});
  }
  scenarios.sort((a,b)=>a.netCents-b.netCents);
  return {tickets:tickets.length,costCents,pWin,pProfit,expectedCents,maxReturnCents:payout((1<<selections.length)-1),worstLossCents:costCents,scenarios};
}
