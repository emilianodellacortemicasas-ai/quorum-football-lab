import { env } from 'cloudflare:workers';
import { fixtureFinal } from './sportmonks';
import { outcome, ticketOutcome, type Final, type Outcome } from './settle-contract';
import { settlementPnl } from './math';
import type { Ticket } from './tickets';

const db = () => env.DB!;
const now = () => new Date().toISOString();

// Saves the tickets proposed by the app so their real performance can be measured.
// One ticket per kind per day; the Bomba once per week (Monday-based).
export async function recordTickets(t: { singles: Ticket[]; tickets: Ticket[]; bomb: Ticket | null; probable?: Ticket[]; sure?: Ticket[] }) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
  const d = new Date(day + 'T12:00:00Z'), monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
  const rows: [string, Ticket][] = [...t.tickets.map(x => [x.kind + ':' + day, x] as [string, Ticket]), ...t.singles.slice(0, 3).map((x, i) => ['raddoppio-singola-' + (i + 1) + ':' + day, x] as [string, Ticket])];
  if (t.bomb) rows.push(['bomba2:' + monday, t.bomb]);
  for (const x of t.probable || []) rows.push([x.kind + ':' + day, x]);
  for (const x of t.sure || []) rows.push([x.kind + ':' + day, x]);
  const stmt = db().prepare('INSERT OR IGNORE INTO scanner_tickets (id,kind,title,legs,odds,p,created_at) VALUES (?,?,?,?,?,?,?)');
  if (rows.length) await db().batch(rows.map(([id, x]) => stmt.bind(id, x.kind, x.title, JSON.stringify(x.legs), x.odds, x.p, now())));
}

async function finalOf(fixtureId: string, cache: Map<string, { status: string; final?: Final }>) {
  if (cache.has(fixtureId)) return cache.get(fixtureId)!;
  const saved = await db().prepare('SELECT status,payload FROM fixture_results WHERE fixture_id=?').bind(fixtureId).first<{ status: string; payload: string }>();
  if (saved && saved.status !== 'pending') { const v = { status: saved.status, final: JSON.parse(saved.payload) }; cache.set(fixtureId, v); return v; }
  let v: { status: string; final?: Final };
  try { v = await fixtureFinal(fixtureId); } catch { v = { status: 'pending' }; }
  if (v.status !== 'pending') await db().prepare('INSERT INTO fixture_results (fixture_id,status,payload,checked_at) VALUES (?,?,?,?) ON CONFLICT(fixture_id) DO UPDATE SET status=excluded.status,payload=excluded.payload,checked_at=excluded.checked_at').bind(fixtureId, v.status, JSON.stringify(v.final ?? null), now()).run();
  cache.set(fixtureId, v); return v;
}
const resultFor = (v: { status: string; final?: Final }, market: string): Outcome => v.status === 'void' ? 'void' : v.status === 'final' && v.final ? (outcome(market, v.final) ?? (Date.now() > 0 ? null : null)) : null;

// Runs after every scan. Only matches started more than 2.5 hours ago are checked.
export async function settleAll(limit = 80) {
  // A match can be final ~1h50 after kickoff; the provider's state (FT) is always checked before settling.
  const cutoff = new Date(Date.now() - 110 * 60000).toISOString(), cache = new Map<string, { status: string; final?: Final }>();
  let settledBets = 0, settledRows = 0, settledTickets = 0;
  // 1. Portfolio bets (fixture kickoff is in the stored snapshot; Sportmonks ids only).
  const bets = (await db().prepare("SELECT id,portfolio_id,fixture_id,market,odds,stake_cents FROM bets WHERE status='pending' AND fixture_id LIKE 'sm-%' LIMIT ?").bind(limit).all<any>()).results;
  for (const bet of bets) {
    const v = await finalOf(bet.fixture_id, cache), r = resultFor(v, bet.market);
    if (!r) continue;
    await db().batch([
      db().prepare("UPDATE bets SET status=?,pnl_cents=?,settled_at=? WHERE id=? AND status='pending'").bind(r, settlementPnl(bet.stake_cents, bet.odds, r), now(), bet.id),
      db().prepare('INSERT INTO portfolio_revisions (portfolio_id,revision) VALUES (?,1) ON CONFLICT(portfolio_id) DO UPDATE SET revision=revision+1').bind(bet.portfolio_id),
    ]);
    settledBets++;
  }
  // 1b. The user's own accumulators (fixture_id 'multi:…', legs in the snapshot). Void legs count as odds 1.
  const multis = (await db().prepare("SELECT id,portfolio_id,stake_cents,snapshot FROM bets WHERE status='pending' AND fixture_id LIKE 'multi:%' LIMIT ?").bind(limit).all<any>()).results;
  for (const bet of multis) {
    let legs: { fixtureId: string; market: string; kickoff: string; odds: number }[] = [];
    try { legs = JSON.parse(bet.snapshot).legs || []; } catch { continue; }
    const res: Outcome[] = [];
    for (const l of legs) {
      if (l.kickoff > cutoff) { res.push(null); continue; }
      const v = cache.has(l.fixtureId) || cache.size < limit ? await finalOf(l.fixtureId, cache) : { status: 'pending' };
      res.push(v.status === 'pending' ? null : resultFor(v as any, l.market) ?? 'void');
    }
    const r = ticketOutcome(res); if (!r) continue;
    const eff = legs.reduce((s, l, i) => s * (res[i] === 'void' ? 1 : l.odds), 1);
    const pnl = r === 'won' ? Math.round(bet.stake_cents * (eff - 1)) : r === 'lost' ? -bet.stake_cents : 0;
    await db().batch([
      db().prepare("UPDATE bets SET status=?,pnl_cents=?,settled_at=? WHERE id=? AND status='pending'").bind(r, pnl, now(), bet.id),
      db().prepare('INSERT INTO portfolio_revisions (portfolio_id,revision) VALUES (?,1) ON CONFLICT(portfolio_id) DO UPDATE SET revision=revision+1').bind(bet.portfolio_id),
    ]);
    settledBets++;
  }
  // 1c. Systems from the Laboratorio: every winning combination pays unit × product of its odds (void legs = 1).
  const systems = (await db().prepare("SELECT id,portfolio_id,stake_cents,snapshot FROM bets WHERE status='pending' AND fixture_id LIKE 'system:%' LIMIT ?").bind(limit).all<any>()).results;
  for (const bet of systems) {
    let snap: any; try { snap = JSON.parse(bet.snapshot); } catch { continue; }
    const legs: { fixtureId: string; market: string; kickoff: string; odds: number }[] = snap.legs || [];
    const classes: { k: number; unitCents: number }[] = snap.system?.classes ?? (snap.system?.k ? [{ k: snap.system.k, unitCents: snap.system.unitCents }] : []);
    if (!legs.length || !classes.length) continue;
    const res: Outcome[] = [];
    for (const l of legs) {
      if (l.kickoff > cutoff) { res.push(null); continue; }
      const v = cache.has(l.fixtureId) || cache.size < limit ? await finalOf(l.fixtureId, cache) : { status: 'pending' };
      res.push(v.status === 'pending' ? null : resultFor(v as any, l.market) ?? 'void');
    }
    // Already lost: every combination of every class contains at least one lost match.
    const anyAlive = classes.some(({ k }) => { let alive = false; const visit = (st: number, combo: number[]) => { if (alive) return; if (combo.length === k) { if (combo.every(i => res[i] !== 'lost')) alive = true; return; } for (let i = st; i < legs.length; i++) visit(i + 1, [...combo, i]); }; visit(0, []); return alive; });
    if (!anyAlive) {
      await db().batch([
        db().prepare("UPDATE bets SET status='lost',pnl_cents=?,settled_at=? WHERE id=? AND status='pending'").bind(-bet.stake_cents, now(), bet.id),
        db().prepare('INSERT INTO portfolio_revisions (portfolio_id,revision) VALUES (?,1) ON CONFLICT(portfolio_id) DO UPDATE SET revision=revision+1').bind(bet.portfolio_id),
      ]);
      settledBets++; continue;
    }
    if (res.some(x => x === null)) continue;
    let payout = 0;
    for (const { k, unitCents: unit } of classes) {
      const visit = (start: number, combo: number[]) => {
        if (combo.length === k) { if (combo.every(i => res[i] !== 'lost')) payout += Math.round(unit * combo.reduce((o, i) => o * (res[i] === 'void' ? 1 : legs[i].odds), 1)); return; }
        for (let i = start; i < legs.length; i++) visit(i + 1, [...combo, i]);
      };
      visit(0, []);
    }
    const allVoid = res.every(x => x === 'void'), pnl = allVoid ? 0 : payout - bet.stake_cents, status = allVoid ? 'void' : pnl > 0 ? 'won' : 'lost';
    await db().batch([
      db().prepare("UPDATE bets SET status=?,pnl_cents=?,settled_at=? WHERE id=? AND status='pending'").bind(status, pnl, now(), bet.id),
      db().prepare('INSERT INTO portfolio_revisions (portfolio_id,revision) VALUES (?,1) ON CONFLICT(portfolio_id) DO UPDATE SET revision=revision+1').bind(bet.portfolio_id),
    ]);
    settledBets++;
  }
  // 2. Every evaluated outcome of the scanner (all runs share the same fixture/market result).
  const pairs = (await db().prepare('SELECT DISTINCT fixture_id,market FROM scanner_rows WHERE result IS NULL AND kickoff < ? LIMIT 2000').bind(cutoff).all<any>()).results;
  const updates: D1PreparedStatement[] = [];
  for (const p of pairs) {
    if (cache.size >= limit && !cache.has(p.fixture_id)) continue;
    const v = await finalOf(p.fixture_id, cache); if (v.status === 'pending') continue;
    const r = resultFor(v, p.market) ?? 'void';
    updates.push(db().prepare('UPDATE scanner_rows SET result=? WHERE fixture_id=? AND market=? AND result IS NULL').bind(r, p.fixture_id, p.market)); settledRows++;
  }
  for (let i = 0; i < updates.length; i += 80) await db().batch(updates.slice(i, i + 80));
  // 3. Proposed tickets.
  const tickets = (await db().prepare('SELECT id,legs FROM scanner_tickets WHERE result IS NULL').all<any>()).results;
  for (const t of tickets) {
    const legs = JSON.parse(t.legs) as { fixtureId: string; market: string; kickoff: string }[], res: Outcome[] = [];
    for (const l of legs) {
      if (l.kickoff > cutoff) { res.push(null); continue; }
      const v = cache.has(l.fixtureId) || cache.size < limit ? await finalOf(l.fixtureId, cache) : { status: 'pending' };
      res.push(v.status === 'pending' ? null : resultFor(v, l.market) ?? 'void');
    }
    const r = ticketOutcome(res);
    if (r) { await db().prepare('UPDATE scanner_tickets SET result=?,settled_at=? WHERE id=?').bind(r, now(), t.id).run(); settledTickets++; }
  }
  return { settledBets, settledRows, settledTickets, checkedFixtures: cache.size };
}

// Real performance of what QUORUM proposed. Each fixture/market counts once, at the last price seen before kickoff.
export async function performance() {
  const value = (await db().prepare(`SELECT r.market,r.best_odds,r.result,r.edge,r.p_blend FROM scanner_rows r JOIN (SELECT fixture_id,market,MAX(created_at) AS c FROM scanner_rows WHERE result IS NOT NULL AND is_pick=1 GROUP BY fixture_id,market) l ON r.fixture_id=l.fixture_id AND r.market=l.market AND r.created_at=l.c`).all<any>()).results;
  const agg = (rows: any[]) => { const s = rows.filter(r => r.result !== 'void'), won = s.filter(r => r.result === 'won'); const profit = won.reduce((x, r) => x + r.best_odds - 1, 0) - (s.length - won.length); return { n: s.length, won: won.length, hit: s.length ? won.length / s.length : null, profit, roi: s.length ? profit / s.length : null, expectedHit: s.length ? s.reduce((x, r) => x + r.p_blend, 0) / s.length : null }; };
  const tickets = (await db().prepare('SELECT kind,odds,p,result,created_at,title FROM scanner_tickets WHERE result IS NOT NULL').all<any>()).results;
  const kinds = [...new Set(tickets.map((t: any) => t.kind))].map(kind => { const rows = tickets.filter((t: any) => t.kind === kind).map((t: any) => ({ ...t, best_odds: t.odds, p_blend: t.p ?? 0 })); const a = agg(rows); return { kind, title: rows[0].title, ...a }; });
  const pending = (await db().prepare('SELECT COUNT(*) AS n FROM scanner_tickets WHERE result IS NULL').first<{ n: number }>())?.n ?? 0;
  const last = (await db().prepare('SELECT id,kind,title,odds,result,created_at,legs FROM scanner_tickets ORDER BY created_at DESC LIMIT 12').all<any>()).results.map((t: any) => ({ ...t, legs: JSON.parse(t.legs) }));
  // Closing line value: price when QUORUM first proposed the pick vs. the last price seen before kick-off.
  const clvRows = (await db().prepare(`WITH f AS (SELECT fixture_id,market,MIN(created_at) AS c FROM scanner_rows WHERE is_pick=1 GROUP BY fixture_id,market),
    l AS (SELECT fixture_id,market,MAX(created_at) AS c FROM scanner_rows WHERE created_at < kickoff GROUP BY fixture_id,market)
    SELECT fo.best_odds AS open,lo.best_odds AS close FROM f JOIN scanner_rows fo ON fo.fixture_id=f.fixture_id AND fo.market=f.market AND fo.created_at=f.c
    JOIN l ON l.fixture_id=f.fixture_id AND l.market=f.market JOIN scanner_rows lo ON lo.fixture_id=l.fixture_id AND lo.market=l.market AND lo.created_at=l.c
    WHERE fo.kickoff < ? AND l.c > f.c`).bind(new Date().toISOString()).all<{ open: number; close: number }>()).results;
  const clv = { n: clvRows.length, beat: clvRows.length ? clvRows.filter(r => r.open > r.close).length / clvRows.length : null, avg: clvRows.length ? clvRows.reduce((s, r) => s + r.open / r.close - 1, 0) / clvRows.length : null };
  return { clv, value: agg(value), valueByMarket: ['1X2', 'Gol', 'Corner', 'Cartellini'].map(g => ({ group: g, ...agg(value.filter((r: any) => g === '1X2' ? ['home', 'draw', 'away'].includes(r.market) : g === 'Gol' ? /^(over|under)\d|^btts|^noGoal/.test(r.market) : g === 'Corner' ? r.market.startsWith('corners:') : r.market.startsWith('cards:'))) })), tickets: kinds, pendingTickets: pending, lastTickets: last };
}

// The Bomba of the current week (Monday-based, Rome time): fixed for the whole week once created.
export async function weeklyBomb() {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
  const d = new Date(day + 'T12:00:00Z'), monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
  const r = await db().prepare('SELECT id,kind,title,legs,odds,p,created_at,result FROM scanner_tickets WHERE id=?').bind('bomba2:' + monday).first<any>();
  return r ? { ...r, legs: JSON.parse(r.legs), week: monday } : null;
}

// The user's own recorded plays (all portfolios), with QUORUM's expectation next to the real outcome.
export async function myPlays(owner: string) {
  const rows = (await db().prepare("SELECT id,portfolio_id,fixture_id,fixture,competition,market,market_label,probability,odds,stake_cents,source,snapshot,status,pnl_cents,created_at,settled_at,shared FROM bets WHERE owner=? ORDER BY created_at DESC LIMIT 300").bind(owner).all<any>()).results;
  const plays = rows.map(r => {
    let legs: any[] = [];
    let system: any = null;
    if (/^(multi|system):/.test(String(r.fixture_id))) { try { const sn = JSON.parse(r.snapshot); legs = sn.legs || []; system = sn.system || null; } catch { } }
    else legs = [{ fixture: r.fixture, label: r.market_label, odds: r.odds }];
    return { id: r.id, portfolioId: r.portfolio_id, shared: !!r.shared, system, name: r.fixture, kind: system ? 'sistema' : legs.length > 1 ? 'multipla' : 'singola', source: r.source, legs, odds: r.odds, p: r.probability, stakeCents: r.stake_cents, status: r.status, pnlCents: r.pnl_cents, createdAt: r.created_at, settledAt: r.settled_at };
  });
  const closed = plays.filter(x => x.status === 'won' || x.status === 'lost'), staked = closed.reduce((s, x) => s + x.stakeCents, 0), pnl = closed.reduce((s, x) => s + x.pnlCents, 0);
  const group = (f: (x: typeof plays[number]) => boolean) => { const c = closed.filter(f), st = c.reduce((s, x) => s + x.stakeCents, 0); return { n: c.length, won: c.filter(x => x.status === 'won').length, expected: c.reduce((s, x) => s + x.p, 0), pnlCents: c.reduce((s, x) => s + x.pnlCents, 0), roi: st ? c.reduce((s, x) => s + x.pnlCents, 0) / st : null }; };
  return {
    plays,
    summary: { total: plays.length, open: plays.filter(x => x.status === 'pending').length, closed: closed.length, won: closed.filter(x => x.status === 'won').length, expected: closed.reduce((s, x) => s + x.p, 0), stakedCents: staked, pnlCents: pnl, roi: staked ? pnl / staked : null },
    bySource: [
      { key: 'quorum', label: 'Schedine proposte da QUORUM', ...group(x => String(x.source).startsWith('mine:schedina')) },
      { key: 'builder', label: 'Costruite da te', ...group(x => x.source === 'mine:builder') },
      { key: 'copied', label: 'Copiate da altri utenti', ...group(x => x.source === 'mine:builder:copiata') },
      { key: 'value', label: 'Value bet', ...group(x => x.source === 'mine:value') },
      { key: 'lab', label: 'Sistemi dal Laboratorio', ...group(x => x.source === 'mine:lab') },
      { key: 'match', label: 'Dal Centro partita', ...group(x => !String(x.source).startsWith('mine:')) },
    ],
    byKind: [{ key: 'singola', label: 'Singole', ...group(x => x.kind === 'singola') }, { key: 'multipla', label: 'Multiple', ...group(x => x.kind === 'multipla') }, { key: 'sistema', label: 'Sistemi', ...group(x => x.kind === 'sistema') }],
  };
}

// Plays that users chose to share, from everyone (own included, flagged), with each author's track record.
export async function sharedPlays(owner: string) {
  const rows = (await db().prepare("SELECT id,owner,author,fixture_id,fixture,competition,market,market_label,probability,odds,stake_cents,snapshot,status,pnl_cents,created_at FROM bets WHERE shared=1 ORDER BY created_at DESC LIMIT 120").all<any>()).results;
  const plays = rows.map(r => {
    let legs: any[] = [];
    let system: any = null;
    if (/^(multi|system):/.test(String(r.fixture_id))) { try { const sn = JSON.parse(r.snapshot); legs = sn.legs || []; system = sn.system || null; } catch { } }
    else { let k = ''; try { k = JSON.parse(r.snapshot)?.legs?.[0]?.kickoff ?? ''; } catch { } legs = [{ fixtureId: r.fixture_id, fixture: r.fixture, competition: r.competition, market: r.market, label: r.market_label, odds: r.odds, p: r.probability, kickoff: k }]; }
    return { id: r.id, mine: r.owner === owner, author: r.author || 'Utente', system, name: r.fixture, legs, odds: r.odds, p: r.probability, stakeCents: r.stake_cents, status: r.status, pnlCents: r.pnl_cents, createdAt: r.created_at };
  });
  const authors = [...new Set(plays.map(x => x.author))].map(a => {
    const c = plays.filter(x => x.author === a && (x.status === 'won' || x.status === 'lost')), st = c.reduce((s, x) => s + x.stakeCents, 0), pnl = c.reduce((s, x) => s + x.pnlCents, 0);
    return { author: a, mine: plays.some(x => x.author === a && x.mine), n: c.length, won: c.filter(x => x.status === 'won').length, pnlCents: pnl, roi: st ? pnl / st : null, open: plays.filter(x => x.author === a && x.status === 'pending').length };
  });
  return { plays, authors };
}

// Settlement on demand (opening Risultati), at most once every 5 minutes for everyone.
export async function settleIfDue() {
  const row = await db().prepare("SELECT built_at FROM model_state WHERE id='settle:last'").first<{ built_at: string }>();
  if (row && Date.now() - Date.parse(row.built_at) < 5 * 60000) return null;
  await db().prepare("INSERT INTO model_state (id,built_at,payload) VALUES ('settle:last',?,'{}') ON CONFLICT(id) DO UPDATE SET built_at=excluded.built_at").bind(now()).run();
  return settleAll(60);
}
