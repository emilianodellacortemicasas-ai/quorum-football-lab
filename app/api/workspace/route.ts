import { env } from 'cloudflare:workers';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../../db';
import { portfolios, bets, locks } from '../../../db/schema';
import { demoMatches, previewPortfolios } from '../../../lib/demo';
import { analyzeMatch, marketLabel, MODEL_VERSION, riskCheck, settlementPnl, evaluateSystem, evaluateClasses, className } from '../../../lib/math';
import { getLiveMatch, hasFootballKey } from '../../../lib/provider';
import { credentialExists } from '../../../lib/vault';
import { isOwner, getIdentity } from '../../../lib/identity';
import type { Bet, Portfolio } from '../../../lib/types';
const failure=(message:string,status=422)=>Response.json({error:message},{status});
async function workspace(owner:string) {
  const db=getDb(),p=await db.select().from(portfolios).where(eq(portfolios.owner,owner)),b=await db.select().from(bets).where(eq(bets.owner,owner));
  return {authenticated:true,portfolios:p.map(({owner,...rest})=>rest),bets:b.map(({owner,snapshot,...rest})=>rest),providerConnected:await hasFootballKey(),aiConnected:await credentialExists('openai')};
}
export async function GET(request:Request) {
  const who=await getIdentity(request),owner=who?.userId;
  if(!owner)return Response.json({authenticated:false,portfolios:previewPortfolios,bets:[],providerConnected:await hasFootballKey(),aiConnected:await credentialExists('openai')},{headers:{'Cache-Control':'no-store'}});
  try{const admin=await isOwner(request,who);const {planOf}=await import('../../../lib/commerce');return Response.json({...await workspace(owner),admin,plan:await planOf(who?.email,admin).catch(()=>null)},{headers:{'Cache-Control':'no-store'}});}catch{return failure('Archivio non disponibile. Riprova tra poco.',503);}
}
const settings=z.object({portfolioId:z.string(),stakeBps:z.number().int().min(1).max(2000),exposureBps:z.number().int().min(1).max(6000),dayBps:z.number().int().min(1).max(6000),drawdownBps:z.number().int().min(1).max(9000)});
export async function POST(request:Request) {
  const owner=(await getIdentity(request))?.userId;if(!owner)return failure('Accedi a QUORUM per salvare i dati.',401);
  if(request.headers.get('origin')!==new URL(request.url).origin)return failure('Origine della richiesta non valida.',403);
  const db=getDb(),raw=env.DB!;
  try {
    const body=await request.json() as any;
    if(body.action==='init') {
      // One personal portfolio per new user; the user names it.
      const existing=await db.select({id:portfolios.id}).from(portfolios).where(eq(portfolios.owner,owner));
      if(!existing.length){
        const name=z.string().trim().min(1).max(40).catch('Il mio portafoglio').parse(body.name);
        const initialCents=z.number().int().min(100).max(100000000).catch(100000).parse(body.initialCents);
        const {id:_,name:__,...p}=previewPortfolios[0],id=owner+'-portfolio-0';
        await db.insert(portfolios).values({...p,name,initialCents,id,owner,createdAt:new Date().toISOString()}).onConflictDoNothing();
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
      if(body.action==='rename'){
        const name=z.string().trim().min(1).max(40).parse(body.name);
        statement=raw.prepare('UPDATE portfolios SET name=? WHERE id=? AND owner=? AND (SELECT revision FROM portfolio_revisions WHERE portfolio_id=?)=?').bind(name,portfolioId,owner,portfolioId,revision);
      } else if(body.action==='capital'){
        // Starting budget chosen by the user (whole euros, 10 € – 10M €). Results already recorded stay as they are.
        const cents=z.number().int().min(1000).max(1000000000).parse(body.initialCents);
        statement=raw.prepare('UPDATE portfolios SET initial_cents=? WHERE id=? AND owner=? AND (SELECT revision FROM portfolio_revisions WHERE portfolio_id=?)=?').bind(cents,portfolioId,owner,portfolioId,revision);
      } else if(body.action==='limits'){
        const enabled=z.boolean().parse(body.enabled);
        statement=raw.prepare('UPDATE portfolios SET limits_enabled=? WHERE id=? AND owner=? AND (SELECT revision FROM portfolio_revisions WHERE portfolio_id=?)=?').bind(enabled?1:0,portfolioId,owner,portfolioId,revision);
      } else if(body.action==='delete'){
        const all=await db.select({id:portfolios.id}).from(portfolios).where(eq(portfolios.owner,owner));
        if(all.length<2)return failure('Tieni almeno un portafoglio: puoi rinominarlo.');
        const used=await db.select({id:bets.id}).from(bets).where(and(eq(bets.owner,owner),eq(bets.portfolioId,portfolioId)));
        if(used.length)return failure('Il portafoglio contiene operazioni registrate: non viene eliminato per non perdere lo storico.');
        await raw.batch([raw.prepare('DELETE FROM portfolio_revisions WHERE portfolio_id=?').bind(portfolioId),raw.prepare('DELETE FROM portfolios WHERE id=? AND owner=?').bind(portfolioId,owner)]);
        return Response.json(await workspace(owner),{headers:{'Cache-Control':'no-store'}});
      } else if(body.action==='settings'){
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
      } else if(body.action==='ticket'){
        // A play chosen by the user (from Costruisci, Schedine or Valore): 1–30 legs on different matches, not started.
        const leg=z.object({fixtureId:z.string().regex(/^sm-\d{1,12}$/),fixture:z.string().min(3).max(120),competition:z.string().max(60),kickoff:z.string().max(40),market:z.string().min(2).max(120),label:z.string().min(1).max(160),p:z.number().min(0.001).max(0.999),odds:z.number().min(1.01).max(1000)}).strict();
        const t=z.object({legs:z.array(leg).min(1).max(30),stakeCents:z.number().int().min(100).max(100000000),source:z.enum(['builder','value','schedina']),kind:z.string().max(40).optional(),shared:z.boolean().optional(),late:z.boolean().optional()}).parse(body);
        if(new Set(t.legs.map(l=>l.fixtureId)).size!==t.legs.length)return failure('Un solo esito per partita.');
        // Late registration: a bet placed before kickoff and saved afterwards (within 150 minutes of the start).
        // The probability of each started leg comes from QUORUM's last scan before kickoff, never from the client.
        if(t.late){
          if(t.legs.some(l=>!(Date.parse(l.kickoff)>Date.now()-150*60000)))return failure('Registrazione tardiva possibile solo entro 2 ore e mezza dall’inizio.');
          for(const l of t.legs){const pq=await closingP(l.fixtureId,l.kickoff,l.market);if(pq===null)return failure('Per '+l.fixture+' QUORUM non ha la stima prima dell’inizio: non posso registrarla.');l.p=pq;}
        }else if(t.legs.some(l=>!(Date.parse(l.kickoff)>Date.now())))return failure('Una partita è già iniziata: toglila dalla schedina.');
        const existing=await db.select().from(bets).where(and(eq(bets.owner,owner),eq(bets.portfolioId,portfolioId)));
        const risk=riskCheck(p as Portfolio,existing as Bet[],t.stakeCents);if(!risk.allowed)return failure(risk.reasons.join(' '));
        const odds=Math.round(t.legs.reduce((s,l)=>s*l.odds,1)*1000)/1000,prob=t.legs.reduce((s,l)=>s*l.p,1),one=t.legs.length===1?t.legs[0]:null;
        const source='mine:'+t.source+(t.kind?':'+t.kind:'')+(t.late?':tardiva':''),now=new Date().toISOString(),authorName=(p as any).name||'Utente';
        statement=raw.prepare('INSERT INTO bets (id,owner,portfolio_id,fixture_id,fixture,competition,market,market_label,probability,odds,stake_cents,source,model_version,snapshot,status,pnl_cents,created_at,shared,author) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT revision FROM portfolio_revisions WHERE portfolio_id=?)=?')
          .bind(crypto.randomUUID(),owner,portfolioId,one?one.fixtureId:'multi:'+crypto.randomUUID(),one?one.fixture:'Multipla · '+t.legs.length+' eventi',one?one.competition:'Multipla',one?one.market:'multi',one?one.label:t.legs.map(l=>l.label).join(' + ').slice(0,200),prob,odds,t.stakeCents,source,'quorum-v2.1',JSON.stringify({legs:t.legs,kickoff:t.legs.map(l=>l.kickoff).sort()[0]}),'pending',0,now,t.shared?1:0,authorName,portfolioId,revision);
      } else if(body.action==='system'){
        // A system from the Laboratorio, like the bookmaker's slip: 1–8 legs, one or more classes (singole, doppie…),
        // each with its own stake per combination. Old format {k, unitCents} is still accepted.
        const leg=z.object({fixtureId:z.string().regex(/^sm-\d{1,12}$/),fixture:z.string().min(3).max(120),competition:z.string().max(60),kickoff:z.string().max(40),market:z.string().min(2).max(120),label:z.string().min(1).max(160),p:z.number().min(0.001).max(0.999),odds:z.number().min(1.01).max(1000)}).strict();
        const cl=z.object({k:z.number().int().min(1).max(8),unitCents:z.number().int().min(5).max(10000000)});
        const t=z.object({legs:z.array(leg).min(1).max(8),classes:z.array(cl).min(1).max(8).optional(),k:z.number().int().min(1).max(8).optional(),unitCents:z.number().int().min(5).max(10000000).optional(),shared:z.boolean().optional()}).parse(body);
        const classes=t.classes??(t.k&&t.unitCents?[{k:t.k,unitCents:t.unitCents}]:[]);
        if(!classes.length||classes.some(c=>c.k>t.legs.length))return failure('Sistema non valido.');
        if(new Set(t.legs.map(l=>l.fixtureId)).size!==t.legs.length)return failure('Un solo esito per partita.');
        if(t.legs.some(l=>!(Date.parse(l.kickoff)>Date.now())))return failure('Una partita è già iniziata: toglila dal sistema.');
        const r=evaluateClasses(t.legs.map(l=>({fixtureId:l.fixtureId,fixture:l.fixture,market:l.market,label:l.label,p:l.p,odds:l.odds})),classes);
        if(r.costCents<200)return failure('Importo minimo del sistema: 2 €.');
        const existing=await db.select().from(bets).where(and(eq(bets.owner,owner),eq(bets.portfolioId,portfolioId)));
        const risk=riskCheck(p as Portfolio,existing as Bet[],r.costCents);if(!risk.allowed)return failure(risk.reasons.join(' '));
        const n=t.legs.length,sorted=[...classes].sort((a,b)=>a.k-b.k),name=sorted.length===1&&sorted[0].k===n?(n===1?'Singola':'Multipla · '+n+' eventi'):'Sistema '+n+' eventi · '+sorted.map(c=>className(c.k,n)).join(' + ');
        statement=raw.prepare('INSERT INTO bets (id,owner,portfolio_id,fixture_id,fixture,competition,market,market_label,probability,odds,stake_cents,source,model_version,snapshot,status,pnl_cents,created_at,shared,author) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT revision FROM portfolio_revisions WHERE portfolio_id=?)=?')
          .bind(crypto.randomUUID(),owner,portfolioId,'system:'+crypto.randomUUID(),name,'Sistema','system',t.legs.map(l=>l.label).join(' + ').slice(0,200),r.pProfit,Math.round(r.maxReturnCents/r.costCents*1000)/1000,r.costCents,'mine:lab','quorum-v2.1',JSON.stringify({legs:t.legs,system:{classes:sorted,combos:r.tickets,costCents:r.costCents,breakEven:r.breakEven,minWinCents:r.minWinCents,maxReturnCents:r.maxReturnCents},kickoff:t.legs.map(l=>l.kickoff).sort()[0]}),'pending',0,new Date().toISOString(),t.shared?1:0,(p as any).name||'Utente',portfolioId,revision);
      } else if(body.action==='remove'){
        // The user deletes one of their own recorded plays (e.g. registered but not actually played).
        // The row disappears: capital, Risultati and shared plays are recalculated without it.
        const b=z.object({id:z.string().max(80)}).parse(body);
        statement=raw.prepare('DELETE FROM bets WHERE id=? AND owner=? AND portfolio_id=? AND (SELECT revision FROM portfolio_revisions WHERE portfolio_id=?)=?').bind(b.id,owner,portfolioId,portfolioId,revision);
      } else if(body.action==='played-at'){
        // Correct the time a play was placed (saved later than played): never after the first kickoff, never in the future.
        const b=z.object({id:z.string().max(80),playedAt:z.string().max(40)}).parse(body);
        const bet=(await db.select().from(bets).where(and(eq(bets.id,b.id),eq(bets.owner,owner),eq(bets.portfolioId,portfolioId))))[0];
        if(!bet)return failure('Giocata non trovata.',404);
        let first=Infinity;try{const sn=JSON.parse(bet.snapshot);first=Math.min(...(sn.legs||[]).map((l:any)=>Date.parse(l.kickoff)).filter(Number.isFinite));}catch{}
        const t=Date.parse(b.playedAt);if(!Number.isFinite(t)||t>Date.now()||t>=first)return failure('L’orario deve essere prima del calcio d’inizio della prima partita.');
        await raw.prepare('UPDATE bets SET created_at=?,source=? WHERE id=? AND owner=?').bind(new Date(t).toISOString(),bet.source.replace(/:tardiva$/,''),bet.id,owner).run();
        return Response.json({ok:true,...await workspace(owner)},{headers:{'Cache-Control':'no-store'}});
      } else if(body.action==='link-cover'){
        // Links a cover saved on its own to the ticket it covers (same group code in the source): "Schedine coperte".
        const b=z.object({coverId:z.string().max(80),ticketId:z.string().max(80),group:z.string().regex(/^[a-z0-9]{4,12}$/)}).parse(body);
        const mine=await db.select().from(bets).where(and(eq(bets.owner,owner),eq(bets.portfolioId,portfolioId)));
        const cov=mine.find(x=>x.id===b.coverId),tic=mine.find(x=>x.id===b.ticketId);
        if(!cov||!tic||!/:copertura/.test(cov.source))return failure('Giocate non trovate.',404);
        const base=(s:string)=>s.replace(/:(coperta|copertura)(-[a-z0-9]{4,12})?/,'');
        await raw.batch([raw.prepare('UPDATE bets SET source=? WHERE id=? AND owner=?').bind(base(cov.source)+':copertura-'+b.group,cov.id,owner),raw.prepare('UPDATE bets SET source=? WHERE id=? AND owner=?').bind(base(tic.source)+':coperta-'+b.group,tic.id,owner)]);
        return Response.json({ok:true,...await workspace(owner)},{headers:{'Cache-Control':'no-store'}});
      } else if(body.action==='edit'){
        // The user corrects stake and/or odds of one of their plays to match what they really played.
        // Pending plays: any type. Closed singles and multiples: the result is recalculated with the new numbers.
        const b=z.object({id:z.string().max(80),stakeCents:z.number().int().min(10).max(100000000),legOdds:z.array(z.number().min(1.01).max(1000)).min(1).max(30)}).parse(body);
        const bet=(await db.select().from(bets).where(and(eq(bets.id,b.id),eq(bets.owner,owner),eq(bets.portfolioId,portfolioId))))[0];
        if(!bet)return failure('Giocata non trovata.',404);
        const kind=bet.fixtureId.startsWith('system:')?'system':bet.fixtureId.startsWith('multi:')?'multi':'single';
        let snap:any={};try{snap=JSON.parse(bet.snapshot);}catch{}
        let odds=bet.odds,stake=b.stakeCents,snapshot=bet.snapshot;
        if(kind==='single'){if(b.legOdds.length!==1)return failure('Quote non valide.');odds=b.legOdds[0];if(Array.isArray(snap.legs)&&snap.legs[0]){snap.legs[0].odds=odds;snapshot=JSON.stringify(snap);}}
        else{
          const legs=Array.isArray(snap.legs)?snap.legs:[];if(legs.length!==b.legOdds.length)return failure('Quote non valide.');
          legs.forEach((l:any,i:number)=>l.odds=b.legOdds[i]);
          if(kind==='multi')odds=Math.round(legs.reduce((q:number,l:any)=>q*l.odds,1)*1000)/1000;
          else{
            if(bet.status!=='pending')return failure('Un sistema già chiuso non si può modificare.');
            const cls=(snap.system?.classes??(snap.system?.k?[{k:snap.system.k,unitCents:snap.system.unitCents}]:[])) as {k:number;unitCents:number}[];
            const old=evaluateClasses(legs,cls),f=b.stakeCents/Math.max(1,old.costCents),ncls=cls.map(c=>({k:c.k,unitCents:Math.max(5,Math.round(c.unitCents*f))})),r=evaluateClasses(legs,ncls);
            snap.system={...snap.system,classes:ncls,costCents:r.costCents,minWinCents:r.minWinCents,maxReturnCents:r.maxReturnCents,breakEven:r.breakEven};
            stake=r.costCents;odds=Math.round(r.maxReturnCents/r.costCents*1000)/1000;
          }
          snapshot=JSON.stringify(snap);
        }
        const pnl=bet.status==='won'?Math.round(stake*(odds-1)):bet.status==='lost'?-stake:0;
        statement=raw.prepare('UPDATE bets SET odds=?,stake_cents=?,snapshot=?,pnl_cents=? WHERE id=? AND owner=? AND portfolio_id=? AND (SELECT revision FROM portfolio_revisions WHERE portfolio_id=?)=?').bind(odds,stake,snapshot,pnl,b.id,owner,portfolioId,portfolioId,revision);
      } else if(body.action==='share'){
        // Show or hide one of the user's own plays to the other users of QUORUM.
        const b=z.object({id:z.string().max(80),shared:z.boolean()}).parse(body);
        statement=raw.prepare('UPDATE bets SET shared=?,author=COALESCE(author,?) WHERE id=? AND owner=? AND portfolio_id=? AND (SELECT revision FROM portfolio_revisions WHERE portfolio_id=?)=?').bind(b.shared?1:0,(p as any).name||'Utente',b.id,owner,portfolioId,portfolioId,revision);
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

// Probability of a market from QUORUM's last scan before kickoff (combo markets from the score matrix).
import { scoreMatrix, customComboP, multigolP } from '../../../lib/exact';
async function closingP(fixtureId:string,kickoff:string,market:string):Promise<number|null>{
  const row=await env.DB!.prepare('SELECT markets,lambda_home,lambda_away FROM scanner_matches WHERE fixture_id=? AND created_at<=? ORDER BY created_at DESC LIMIT 1').bind(fixtureId,kickoff).first<any>().catch(()=>null);
  if(!row)return null;const mk=JSON.parse(row.markets),pb=(k:string)=>Number.isFinite(mk[k]?.pBlend)?mk[k].pBlend:null;
  if(pb(market)!==null)return Math.min(0.999,Math.max(0.001,pb(market)!));
  const b=[pb('home'),pb('draw'),pb('away')];if(b.some(x=>x===null))return null;
  const lh=Number.isFinite(row.lambda_home)?row.lambda_home:1.4,la=Number.isFinite(row.lambda_away)?row.lambda_away:1.1,u=pb('under25');
  const sc=scoreMatrix(lh,la,mk.meta?.rho??0,{home:b[0]!,draw:b[1]!,away:b[2]!,...(u!==null?{under25:u}:{})});
  let x:number|null=null;
  if(market.startsWith('combo:'))x=customComboP(sc,market.slice(6).split(' + ').filter(q=>!q.startsWith('scorer=')));
  else{const m=/^multigol:(\d+)-(\d+)$/.exec(market);if(m)x=multigolP(sc,Number(m[1]),Number(m[2]));
    const REV:Record<string,string>={home:'1',draw:'X',away:'2',homeDraw:'1X',drawAway:'X2',homeAway:'12',btts:'Goal',noGoal:'No Goal'},ou=/^(over|under)(\d)(\d)$/.exec(market);
    const part=REV[market]??(ou?(ou[1]==='over'?'Over ':'Under ')+ou[2]+','+ou[3]:null);if(x===null&&part)x=customComboP(sc,[part]);}
  return x===null?null:Math.min(0.999,Math.max(0.001,x));
}
