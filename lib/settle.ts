import { env } from 'cloudflare:workers';
import { fixtureFinal } from './sportmonks';
import { outcome, ticketOutcome, type Final, type Outcome } from './settle-contract';
import { settlementPnl } from './math';
import type { Ticket } from './tickets';

const db = () => env.DB!;
const now = () => new Date().toISOString();

// Saves the tickets proposed by the app so their real performance can be measured.
// One ticket per kind per day; the Bomba once per week (Monday-based).
export async function recordTickets(t: { singles: Ticket[]; tickets: Ticket[]; bomb: Ticket | null }) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
  const d = new Date(day + 'T12:00:00Z'), monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
  const rows: [string, Ticket][] = [...t.tickets.map(x => [x.kind + ':' + day, x] as [string, Ticket]), ...t.singles.slice(0, 3).map((x, i) => ['raddoppio-singola-' + (i + 1) + ':' + day, x] as [string, Ticket])];
  if (t.bomb) rows.push(['bomba:' + monday, t.bomb]);
  const stmt = db().prepare('INSERT OR IGNORE INTO scanner_tickets (id,kind,title,legs,odds,p,created_at) VALUES (?,?,?,?,?,?,?)');
  if (rows.length) await db().batch(rows.map(([id, x]) => stmt.bind(id, x.kind, x.title, JSON.stringify(x.legs.map(l => ({ fixtureId: l.fixtureId, fixture: l.fixture, market: l.market, label: l.label, odds: l.odds, p: l.p, kickoff: l.kickoff }))), x.odds, x.p, now())));
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
  const cutoff = new Date(Date.now() - 2.5 * 3600000).toISOString(), cache = new Map<string, { status: string; final?: Final }>();
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
  const tickets = (await db().prepare('SELECT kind,odds,result,created_at,title FROM scanner_tickets WHERE result IS NOT NULL').all<any>()).results;
  const kinds = [...new Set(tickets.map((t: any) => t.kind))].map(kind => { const rows = tickets.filter((t: any) => t.kind === kind).map((t: any) => ({ ...t, best_odds: t.odds, p_blend: 0 })); const a = agg(rows); return { kind, title: rows[0].title, ...a }; });
  const pending = (await db().prepare('SELECT COUNT(*) AS n FROM scanner_tickets WHERE result IS NULL').first<{ n: number }>())?.n ?? 0;
  const last = (await db().prepare('SELECT id,kind,title,odds,result,created_at,legs FROM scanner_tickets ORDER BY created_at DESC LIMIT 12').all<any>()).results.map((t: any) => ({ ...t, legs: JSON.parse(t.legs) }));
  return { value: agg(value), valueByMarket: ['1X2', 'Gol', 'Corner', 'Cartellini'].map(g => ({ group: g, ...agg(value.filter((r: any) => g === '1X2' ? ['home', 'draw', 'away'].includes(r.market) : g === 'Gol' ? /^(over|under)\d|^btts|^noGoal/.test(r.market) : g === 'Corner' ? r.market.startsWith('corners:') : r.market.startsWith('cards:'))) })), tickets: kinds, pendingTickets: pending, lastTickets: last };
}
