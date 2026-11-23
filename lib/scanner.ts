import { lambdasFromMarket } from './exact.ts';
import { tipsterPicks, tipsterTickets } from './tipster.ts';
import { env } from 'cloudflare:workers';
import { getModel, getSportmonksFixtures, getSportmonksMatch } from './sportmonks';
import { oddsFeed } from './odds-provider';
import { analyzeMatch, marketLabel } from './math';
import { calibrate, familyOf } from './calibration';
import { loadCalibration } from './calibration-store';
import { italianOdds, matchItalian, type ItalianFixture } from './italian-odds';
import { ODDS_SPORT, SCANNED_MARKETS, evaluateOutcome, marketConsensus, matchEvent, type OddsEvent } from './scanner-contract';
import type { Match } from './types';
import { buildTickets } from './tickets';
import { recordRows, recordTickets, settleAll } from './settle';

const db = () => { if (!env.DB) throw new Error('Database non disponibile.'); return env.DB; };
const romeDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
// Free The Odds API plan: 500 credits/month. Below this reserve the scanner stops calling it.
const ODDS_RESERVE = 12;
// Manual refreshes reuse odds younger than this: the model is recomputed for free.
const ODDS_MAX_AGE = 30 * 60000;
// Goal/No Goal is an event-level market (1 credit per match): refreshed twice a day, reused in between.
const BTTS_MAX_AGE = 12 * 3600000;

async function lastOddsRemaining() {
  const r = await db().prepare("SELECT odds_remaining FROM scanner_runs WHERE odds_remaining IS NOT NULL ORDER BY started_at DESC LIMIT 1").first<{ odds_remaining: number }>();
  return r?.odds_remaining ?? null;
}
export async function lastRun() {
  return db().prepare('SELECT * FROM scanner_runs ORDER BY started_at DESC LIMIT 1').first<any>();
}

// Map bookmaker scorer names to the model's scorers (by normalized name) → 'scorer:<id>' keys.
function mapScorers(consensus: Record<string, any>, m: Match | null) {
  const out: Record<string, any> = {}, sc = [...(m?.context?.scorers?.home || []), ...(m?.context?.scorers?.away || [])];
  for (const [k, v] of Object.entries(consensus)) {
    if (!k.startsWith('anytime:')) { out[k] = v; continue; }
    const name = k.slice(8), p = sc.find(s => { const n = s.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); return name === n.replace(/[^a-z0-9 ]+/g, ' ').trim() || name.split(' ').pop() === n.split(' ').pop(); });
    if (p) out['scorer:' + p.id] = { ...v, label: 'Marcatore: ' + p.name, pModel: p.p };
  }
  return out;
}
const marketKeys = (c: Record<string, unknown>) => [...SCANNED_MARKETS, ...Object.keys(c).filter(k => k.startsWith('corners:') || k.startsWith('cards:') || k.startsWith('scorer:'))];
async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>) {
  const out: R[] = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

export async function runScan(trigger: 'cron' | 'manual' | 'prematch') {
  const id = crypto.randomUUID(), started = new Date().toISOString();
  const running = await db().prepare("SELECT id FROM scanner_runs WHERE status='running' AND started_at > ?").bind(new Date(Date.now() - 10 * 60000).toISOString()).first();
  if (running) throw new Error('Una scansione è già in corso. Riprova tra qualche minuto.');
  await db().prepare('INSERT INTO scanner_runs (id,trigger,status,started_at) VALUES (?,?,?,?)').bind(id, trigger, 'running', started).run();
  const notes: string[] = [];
  try {
    const remainingBefore = await lastOddsRemaining();
    if (remainingBefore !== null && remainingBefore < ODDS_RESERVE) throw new Error('Crediti The Odds API quasi esauriti (' + remainingBefore + '). Si rinnovano a inizio mese, oppure passa al piano a pagamento.');
    // 0. Rebuild the v2 model once per scan (ratings, tables, form).
    // The pre-kickoff refresh reuses the model built by the last full scan.
    await getModel(trigger !== 'prematch');
    // 1. Calendar: next 7 days, only matches not yet started (at least 15 minutes ahead).
    const now = Date.now(), horizon = now + 7 * 24 * 3600000;
    const days = [0, 1, 2, 3, 4, 5, 6, 7].map(d => romeDate(new Date(now + d * 86400000)));
    const fixtures: Match[] = [];
    for (const d of days) fixtures.push(...await getSportmonksFixtures(d));
    const upcoming = [...new Map(fixtures.map(f => [f.id, f])).values()].filter(f => { const t = Date.parse(f.kickoff); return t > now + 15 * 60000 && t <= horizon; });
    // 2. Odds: one request per competition (h2h + totals, EU books = 2 credits each). Only sports active on the provider.
    const active = new Set(((await oddsFeed('sports', 3600)).payload as any[]).map(s => s.key));
    const events = new Map<string, OddsEvent[]>(); let remaining: number | null = null, reused = 0, downloaded = 0;
    for (const comp of new Set(upcoming.map(f => f.competition))) {
      const key = ODDS_SPORT[comp];
      if (!key || !active.has(key)) { notes.push(comp + ': quote non disponibili dal fornitore.'); continue; }
      try {
        // Odds saved in D1 are reused for up to ODDS_MAX_AGE (0 credits); the daily cron always downloads fresh odds.
        const cacheId = 'odds:' + key, saved = await db().prepare('SELECT built_at,payload FROM model_state WHERE id=?').bind(cacheId).first<{ built_at: string; payload: string }>();
        if (trigger === 'manual' && saved && Date.now() - Date.parse(saved.built_at) < ODDS_MAX_AGE) { events.set(comp, JSON.parse(saved.payload)); reused++; continue; }
        const r = await oddsFeed('sports/' + key + '/odds?regions=eu&markets=h2h,totals&oddsFormat=decimal', 600);
        const list = Array.isArray(r.payload) ? r.payload : [];
        events.set(comp, list); downloaded++;
        await db().prepare('INSERT INTO model_state (id,built_at,payload) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET built_at=excluded.built_at,payload=excluded.payload').bind(cacheId, new Date().toISOString(), JSON.stringify(list)).run();
        if (r.remaining !== null && Number.isFinite(Number(r.remaining))) remaining = Number(r.remaining);
      } catch (e) { notes.push(comp + ': ' + (e instanceof Error ? e.message : 'quote non disponibili.')); }
    }
    // 3. Reconcile fixtures with odds events, then model only the matched ones.
    const paired = upcoming.map(f => ({ f, e: matchEvent(f, events.get(f.competition) || []) })).filter(x => x.e) as { f: Match; e: OddsEvent }[];
    // Goal/No Goal odds per event, merged into the event's bookmakers.
    let bttsDownloaded = 0;
    await pool(paired, 4, async ({ f, e }) => {
      const key = ODDS_SPORT[f.competition]; if (!key) return;
      const cacheId = 'ev2:' + e.id, saved = await db().prepare('SELECT built_at,payload FROM model_state WHERE id=?').bind(cacheId).first<{ built_at: string; payload: string }>();
      let books: any[] | null = saved && Date.now() - Date.parse(saved.built_at) < BTTS_MAX_AGE ? JSON.parse(saved.payload) : null;
      if (!books) {
        try {
          let r: any;
          // Minor leagues: only Goal/No Goal (corner, cards and scorers would double the credits).
          try { r = await oddsFeed('sports/' + key + '/events/' + e.id + '/odds?regions=eu&markets=' + (['Serie B', 'Championship'].includes(f.competition) ? 'btts' : ['Champions League', 'Europa League'].includes(f.competition) ? 'btts,player_goal_scorer_anytime' : 'btts,alternate_totals_corners,alternate_totals_cards,player_goal_scorer_anytime') + '&oddsFormat=decimal', 600); }
          catch { r = await oddsFeed('sports/' + key + '/events/' + e.id + '/odds?regions=eu&markets=btts&oddsFormat=decimal', 600); }
          books = Array.isArray(r.payload?.bookmakers) ? r.payload.bookmakers : []; bttsDownloaded++;
          if (r.remaining !== null && Number.isFinite(Number(r.remaining))) remaining = Number(r.remaining);
          await db().prepare('INSERT INTO model_state (id,built_at,payload) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET built_at=excluded.built_at,payload=excluded.payload').bind(cacheId, new Date().toISOString(), JSON.stringify(books)).run();
        } catch { books = []; }
      }
      e.bookmakers = [...(e.bookmakers || []), ...(books ?? [])];
    });
    if (bttsDownloaded) notes.push('Quote Goal/No Goal, corner e cartellini aggiornate per ' + bttsDownloaded + ' partite.');
    const fetched = await pool(paired, 4, async ({ f }) => { try { return await getSportmonksMatch(f.id); } catch { return null; } });
    const modelled = fetched.map((m, i) => m && m.lambdaHome !== null && m.lambdaAway !== null ? { m, e: paired[i].e } : null);
    let ita: ItalianFixture[] = [];
    try { ita = (await italianOdds()) ?? []; if (ita.length) notes.push('Quote italiane (Lottomatica/Planetwin365, Snai, Sisal, Eurobet) disponibili per ' + ita.length + ' partite.'); }
    catch (err) { notes.push('Quote italiane non aggiornate: ' + (err instanceof Error ? err.message : 'errore OddsPapi') + '.'); }
    const itFor = (f: { home: string; away: string; kickoff: string; competition: string }) => ita.length ? matchItalian(f, ita) : null;
    // Best Italian price for a market, with edge and quarter Kelly (cap 2%) against QUORUM's probability.
    const itBest = (fx: ItalianFixture | null, key: string, p: number) => {
      const q = fx?.quotes[key]; if (!q) return null;
      const sorted = Object.entries(q).sort((a, b) => b[1].odds - a[1].odds), v = sorted[0][1];
      const book = sorted.filter(x => x[1].odds === v.odds).map(x => x[0]).join(' = ');
      const edge = p * v.odds - 1, kelly = edge > 0 ? Math.min(0.02, 0.25 * edge / (v.odds - 1)) : 0;
      return { book, odds: v.odds, edge, kelly, all: Object.fromEntries(Object.entries(q).map(([b, x]) => [b, x.odds])) };
    };
    // Measured calibration: model probabilities corrected with the backtest, final ones with settled results.
    const cal = await loadCalibration().catch(() => null);
    const calModel = (key: string, p: number) => { const f = familyOf(key); return f && cal?.model ? calibrate(p, f, cal.model).p : p; };
    const calLive = (key: string) => { const f = familyOf(key); return f && cal?.live ? (p: number) => calibrate(p, f, cal.live).p : undefined; };
    const measured = (key: string, p: number) => { const f = familyOf(key); return f && cal?.model ? calibrate(p, f, cal.model) : null; };
    // Per-match predictions: every paired match, with the model when available and the market otherwise.
    const matchRows: any[] = [];
    paired.forEach(({ f, e }, i) => {
      const raw0 = marketConsensus(e), fm0 = fetched[i] as any;
      // Cups: scorer probabilities = domestic goal share × goals expected by the market.
      if (!modelled[i] && fm0?.context?.scorerShares && raw0.home && raw0.draw && raw0.away) {
        const ml0 = lambdasFromMarket({ home: raw0.home.pMarket, draw: raw0.draw.pMarket, away: raw0.away.pMarket, over25: raw0.over25?.pMarket });
        if (ml0) { const sp = (list: any[], lam: number) => list.map((p: any) => ({ id: p.id, name: p.name, p: 1 - Math.exp(-p.share * lam * 0.85) })); fm0.context.scorers = { home: sp(fm0.context.scorerShares.home, ml0.lh), away: sp(fm0.context.scorerShares.away, ml0.la) }; }
      }
      const x = modelled[i], consensus = mapScorers(raw0, fetched[i]), probs = x ? analyzeMatch(x.m)!.markets : null, markets: Record<string, any> = {}, fit = itFor(f);
      for (const key of marketKeys(consensus)) {
        const c = consensus[key]; if (!c) continue;
        const raw = Number.isFinite(c.pModel) ? c.pModel : probs && Number.isFinite(probs[key]) ? probs[key] : null;
        const pModel = raw === null ? null : calModel(key, raw);
        const pBlend = pModel === null ? c.pMarket : evaluateOutcome(pModel, c, calLive(key)).pBlend, it = itBest(fit, key, pBlend), ms = measured(key, pBlend);
        markets[key] = { ...(c.label ? { label: c.label } : {}), pModel, pMarket: c.pMarket, ...(c.pSharp ? { pSharp: c.pSharp } : {}), pBlend, bestOdds: c.bestOdds, bookmaker: c.bookmaker, books: c.books, ...(it ? { it: it.all } : {}), ...(ms ? { se: ms.se, calN: ms.n } : {}) };
      }
      if (fit?.at) markets.itAt = fit.at;
      // Italian correct-score prices (exact:1-0 → {Lottomatica: 6.5, …}), shown next to QUORUM's exact scores.
      if (fit) { const ex: Record<string, Record<string, number>> = {}; for (const [k, q] of Object.entries(fit.quotes)) if (k.startsWith('exact:')) ex[k.slice(6)] = Object.fromEntries(Object.entries(q).filter(([b]) => b !== 'Planetwin365').map(([b, x]) => [b, x.odds])); if (Object.keys(ex).length) markets.itExact = ex; }
      // Double chance: probability = sum of the two 1X2 outcomes; price only from Lottomatica / Planetwin365.
      for (const [k, a, b] of [['homeDraw', 'home', 'draw'], ['drawAway', 'draw', 'away'], ['homeAway', 'home', 'away']] as const) {
        const x = markets[a], y = markets[b], q = fit?.quotes[k]; if (!x || !y || !q) continue;
        const pBlend = Math.min(0.995, x.pBlend + y.pBlend), sorted = Object.entries(q).sort((u, v) => v[1].odds - u[1].odds), best = sorted[0][1].odds;
        markets[k] = { pModel: x.pModel !== null && y.pModel !== null ? x.pModel + y.pModel : null, pMarket: x.pMarket + y.pMarket, pBlend, bestOdds: best, bookmaker: sorted.filter(e => e[1].odds === best).map(e => e[0]).join(' / '), books: Math.min(x.books, y.books), it: Object.fromEntries(sorted.map(([bk, v]) => [bk, v.odds])), se: Math.sqrt((x.se ?? 0.02) ** 2 + (y.se ?? 0.02) ** 2) };
      }
      const fm = fetched[i]; if (fm) markets.meta = { calibration: cal ? { backtestSamples: cal.backtestSamples, liveSamples: cal.liveSamples, backtestAt: cal.backtestAt } : null, sampleHome: fm.sampleHome, sampleAway: fm.sampleAway, counts: fm.counts ?? null, ...fm.context };
      // No model (e.g. European cups): expected goals taken from the market, so exact scores, combo and Multigol still work.
      const ml = x ? null : lambdasFromMarket({ home: markets.home?.pMarket, draw: markets.draw?.pMarket, away: markets.away?.pMarket, over25: markets.over25?.pMarket });
      if (Object.keys(markets).length) matchRows.push([crypto.randomUUID(), id, f.id, f.home + ' – ' + f.away, f.competition, f.kickoff, x ? 1 : 0, x ? x.m.lambdaHome : ml?.lh ?? null, x ? x.m.lambdaAway : ml?.la ?? null, JSON.stringify(markets), new Date().toISOString()]);
    });
    const insertMatch = db().prepare('INSERT INTO scanner_matches (id,run_id,fixture_id,fixture,competition,kickoff,modelled,lambda_home,lambda_away,markets,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    for (let i = 0; i < matchRows.length; i += 50) await db().batch(matchRows.slice(i, i + 50).map(r => insertMatch.bind(...r)));
    // 4. Evaluate every outcome; store all of them (dataset for settlement and backtest), flag the picks.
    const created = new Date().toISOString(), rows: any[] = [];
    for (const x of modelled) {
      if (!x) continue;
      const probs = analyzeMatch(x.m)!.markets, consensus = mapScorers(marketConsensus(x.e), x.m), fit = itFor(x.m);
      for (const key of marketKeys(consensus)) {
        const c = consensus[key], raw = Number.isFinite(c?.pModel) ? c.pModel : probs[key]; if (!c || !Number.isFinite(raw)) continue;
        const pm = calModel(key, raw), v = evaluateOutcome(pm, c, calLive(key)), it = itBest(fit, key, v.pBlend);
        rows.push([crypto.randomUUID(), id, x.m.id, x.m.home + ' – ' + x.m.away, x.m.competition, x.m.kickoff, key, c.label ?? marketLabel(key), pm, c.pMarket, v.pBlend, c.bestOdds, c.bookmaker, c.books, v.edge, v.kelly, v.isPick ? 1 : 0, created, it?.odds ?? null, it?.book ?? null, it?.edge ?? null, it?.kelly ?? null]);
      }
    }
    const insert = db().prepare('INSERT INTO scanner_rows (id,run_id,fixture_id,fixture,competition,kickoff,market,label,p_model,p_market,p_blend,best_odds,bookmaker,books,edge,kelly,is_pick,created_at,it_odds,it_book,it_edge,it_kelly) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (let i = 0; i < rows.length; i += 50) await db().batch(rows.slice(i, i + 50).map(r => insert.bind(...r)));
    const picks = rows.filter(r => r[16] === 1).length, modelledCount = modelled.filter(Boolean).length;
    if (reused) notes.push('Quote riusate per ' + reused + ' campionati (scaricate meno di 30 minuti fa, 0 crediti).');
    if (upcoming.length && !paired.length) notes.push('Nessuna partita abbinata alle quote.');
    if (paired.length > modelledCount) notes.push((paired.length - modelledCount) + ' partite senza storico sufficiente per il modello.');
    await db().prepare('UPDATE scanner_runs SET status=?,finished_at=?,fixtures=?,matched=?,modelled=?,picks=?,odds_remaining=?,message=? WHERE id=?')
      .bind('ok', new Date().toISOString(), upcoming.length, paired.length, modelledCount, picks, remaining ?? remainingBefore, notes.join(' ') || null, id).run();
    // Save today's tickets and settle finished matches. Failures here never invalidate the scan.
    try { const lp = (await latestPredictions()).matches; await recordTickets(buildTickets(lp)); await recordRows(tipsterTickets(tipsterPicks(lp))); } catch { /* recorded on next scan */ }
    try { await settleAll(); } catch { /* retried on next scan */ }
    return { id, fixtures: upcoming.length, matched: paired.length, modelled: modelledCount, picks };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Scansione non riuscita.';
    await db().prepare('UPDATE scanner_runs SET status=?,finished_at=?,message=? WHERE id=?').bind('error', new Date().toISOString(), message, id).run();
    throw new Error(message);
  }
}

export async function latestPicks() {
  const run = await db().prepare("SELECT * FROM scanner_runs WHERE status='ok' ORDER BY started_at DESC LIMIT 1").first<any>();
  const last = await lastRun();
  if (!run) return { run: null, last, picks: [], evaluated: 0 };
  const picks = (await db().prepare('SELECT * FROM scanner_rows WHERE run_id=? AND (edge > 0 OR it_edge > 0) AND kickoff > ? ORDER BY is_pick DESC, COALESCE(it_edge, edge) DESC LIMIT 200').bind(run.id, new Date().toISOString()).all<any>()).results;
  const evaluated = (await db().prepare('SELECT COUNT(*) AS n FROM scanner_rows WHERE run_id=?').bind(run.id).first<{ n: number }>())?.n ?? 0;
  return { run, last, picks, evaluated };
}

export async function latestPredictions() {
  const run = await db().prepare("SELECT * FROM scanner_runs WHERE status='ok' ORDER BY started_at DESC LIMIT 1").first<any>();
  if (!run) return { run: null, matches: [] };
  const rows = (await db().prepare('SELECT * FROM scanner_matches WHERE run_id=? AND kickoff > ? ORDER BY kickoff').bind(run.id, new Date().toISOString()).all<any>()).results;
  return { run, matches: rows.map(r => ({ ...r, markets: JSON.parse(r.markets) })) };
}

// Pre-kickoff refresh: a match starts in 20–80 minutes (official line-ups are usually out ~1 hour before)
// and the last scan is older than 40 minutes.
export async function prematchDue() {
  const now = Date.now();
  const last = await db().prepare("SELECT started_at FROM scanner_runs ORDER BY started_at DESC LIMIT 1").first<{ started_at: string }>();
  if (last && now - Date.parse(last.started_at) < 40 * 60000) return false;
  const run = await db().prepare("SELECT id FROM scanner_runs WHERE status='ok' ORDER BY started_at DESC LIMIT 1").first<{ id: string }>();
  if (!run) return false;
  const soon = await db().prepare('SELECT COUNT(*) AS n FROM scanner_matches WHERE run_id=? AND kickoff BETWEEN ? AND ?')
    .bind(run.id, new Date(now + 20 * 60000).toISOString(), new Date(now + 80 * 60000).toISOString()).first<{ n: number }>();
  return (soon?.n ?? 0) > 0;
}
