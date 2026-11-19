import { env } from 'cloudflare:workers';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../db';
import { portfolios, bets, locks } from '../../../db/schema';
import { demoMatches, previewPortfolios } from '../../../lib/demo';
import { analyzeMatch, marketLabel, MODEL_VERSION, riskCheck, settlementPnl } from '../../../lib/math';
import { getLiveMatch, hasFootballKey } from '../../../lib/provider';
import { credentialExists } from '../../../lib/vault';
import { getIdentity } from '../../../lib/identity';
import type { Bet, Portfolio } from '../../../lib/types';
const failure=(message:string,status=422)=>Response.json({error:message},{status});
async function workspace(owner:string) {
  const db=getDb(),p=await db.select().from(portfolios).where(eq(portfolios.owner,owner)),b=await db.select().from(bets).where(eq(bets.owner,owner));
  return {authenticated:true,portfolios:p.map(({owner,...rest})=>rest),bets:b.map(({owner,snapshot,...rest})=>rest),providerConnected:await hasFootballKey(),aiConnected:await credentialExists('openai')};
}
export async function GET(request:Request) {
  const owner=(await getIdentity(request))?.userId;
  if(!owner)return Response.json({authenticated:false,portfolios:previewPortfolios,bets:[],providerConnected:await hasFootballKey(),aiConnected:await credentialExists('openai')},{headers:{'Cache-Control':'no-store'}});
  try{return Response.json(await workspace(owner),{headers:{'Cache-Control':'no-store'}});}catch{return failure('Archivio non disponibile. Riprova tra poco.',503);}
}
const settings=z.object({portfolioId:z.string(),stakeBps:z.number().int().min(1).max(500),exposureBps:z.number().int().min(1).max(2000),dayBps:z.number().int().min(1).max(2000),drawdownBps:z.number().int().min(1).max(5000)});
export async function POST(request:Request) {
  const owner=(await getIdentity(request))?.userId;if(!owner)return failure('Accedi a QUORUM per salvare i dati.',401);
  if(request.headers.get('origin')!==new URL(request.url).origin)return failure('Origine della richiesta non valida.',403);
  const db=getDb(),raw=env.DB!;
  try {
    const body=await request.json() as any;
    if(body.action==='init') {
      for(let i=0;i<previewPortfolios.length;i++){
        const p=previewPortfolios[i],id=owner+'-portfolio-'+i;
        await db.insert(portfolios).values({...p,id,owner,createdAt:new Date().toISOString()}).onConflictDoNothing();
        await db.insert(locks).values({portfolioId:id,revision:0}).onConflictDoNothing();
      }
    } else if(body.action==='portfolio'){
      const p=z.object({name:z.string().trim().min(1).max(40),initialCents:z.number().int().min(100).max(100000000)}).parse(body);
      const id=crypto.randomUUID();await db.insert(portfolios).values({...p,id,owner,mode:'paper',createdAt:new Date().toISOString()});
      await db.insert(locks).values({portfolioId:id,revision:0});
    } else {
      const portfolioId=z.string().parse(body.portfolioId),p=(await db.select().from(portfolios).where(and(eq(portfolios.id,portfolioId),eq(portfolios.owner,owner))))[0];
      if(!p)return failure('Portafoglio non trovato.',404);
      const revision=(await db.select().from(locks).where(eq(locks.portfolioId,portfolioId)))[0]?.revision;
      if(revision===undefined)return failure('Portafoglio non inizializzato.',409);
      const advance=raw.prepare('UPDATE portfolio_revisions SET revision=revision+1 WHERE portfolio_id=? AND revision=?').bind(portfolioId,revision);
      let statement:D1PreparedStatement;
      if(body.action==='settings'){
        const s=settings.parse(body);
        if(s.stakeBps>s.exposureBps || s.stakeBps>s.dayBps)return failure('Il limite singolo deve rientrare nei limiti di giornata e di esposizione.');
        statement=raw.prepare('UPDATE portfolios SET stake_bps=?,exposure_bps=?,day_bps=?,drawdown_bps=? WHERE id=? AND owner=? AND (SELECT revision FROM portfolio_revisions WHERE portfolio_id=?)=?').bind(s.stakeBps,s.exposureBps,s.dayBps,s.drawdownBps,portfolioId,owner,portfolioId,revision);
      } else if(body.action==='add') {
        const b=z.object({fixtureId:z.string().max(30),market:z.string().max(40),odds:z.number().min(1.01).max(1000),stakeCents:z.number().int().positive().max(100000000)}).parse(body);
        const match=b.fixtureId.startsWith('demo-')?demoMatches.find(m=>m.id===b.fixtureId):await getLiveMatch(b.fixtureId);
        if(!match || match.lambdaHome===null || match.lambdaAway===null)return failure('Dati insufficienti per registrare la previsione.');
        if(match.source==='demo' && p.mode!=='paper')return failure('Gli scenari demo sono riservati alla simulazione.');
        const probability=analyzeMatch(match)?.markets[b.market] ?? NaN;
        if(!Number.isFinite(probability)||probability<=0||probability>=1)return failure('Mercato non supportato.');
        const existing=await db.select().from(bets).where(and(eq(bets.owner,owner),eq(bets.portfolioId,portfolioId)));
        if(existing.some(x=>x.fixtureId===match.id&&x.status==='pending'))return failure('Hai già un’operazione aperta su questa partita.');
        const risk=riskCheck(p as Portfolio,existing as Bet[],b.stakeCents);if(!risk.allowed)return failure(risk.reasons.join(' '));
        statement=raw.prepare('INSERT INTO bets (id,owner,portfolio_id,fixture_id,fixture,competition,market,market_label,probability,odds,stake_cents,source,model_version,snapshot,status,pnl_cents,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT revision FROM portfolio_revisions WHERE portfolio_id=?)=?').bind(crypto.randomUUID(),owner,portfolioId,match.id,match.home+' – '+match.away,match.competition,b.market,marketLabel(b.market),probability,b.odds,b.stakeCents,match.source,MODEL_VERSION,JSON.stringify(match),'pending',0,new Date().toISOString(),portfolioId,revision);
      } else if(body.action==='settle'){
        const b=z.object({id:z.string(),status:z.enum(['won','lost','void'])}).parse(body);
        const bet=(await db.select().from(bets).where(and(eq(bets.id,b.id),eq(bets.owner,owner),eq(bets.portfolioId,portfolioId))))[0];
        if(!bet || bet.status!=='pending')return failure('Operazione già chiusa o non disponibile.',409);
        statement=raw.prepare('UPDATE bets SET status=?,pnl_cents=?,settled_at=? WHERE id=? AND owner=? AND status=? AND (SELECT revision FROM portfolio_revisions WHERE portfolio_id=?)=?').bind(b.status,settlementPnl(bet.stakeCents,bet.odds,b.status),new Date().toISOString(),b.id,owner,'pending',portfolioId,revision);
      } else return failure('Azione non supportata.');
      const result=await raw.batch([statement,advance]);
      if(result[0].meta.changes!==1)return failure('Il portafoglio è cambiato in un’altra sessione. Aggiorna e riprova.',409);
    }
    return Response.json(await workspace(owner),{headers:{'Cache-Control':'no-store'}});
  } catch(e){
    if(e instanceof z.ZodError)return failure('Controlla importi e campi inseriti.');
    return failure(e instanceof Error&&/dati|piano|Partita|partite|modello|Fornitore|Competizione/i.test(e.message)?e.message:'Salvataggio non riuscito. Nessuna conferma ricevuta.',503);
  }
}
