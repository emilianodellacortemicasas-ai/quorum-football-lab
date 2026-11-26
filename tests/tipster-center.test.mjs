import test from 'node:test';
import assert from 'node:assert/strict';
import { performance, segments, streaks, movements, margins, opportunities, oddsBand } from '../lib/tipster-center.ts';

const now = Date.parse('2026-11-25T12:00:00Z');
const rec = (i, res, odds, closeP, extra = {}) => ({ id: 'r' + i, kind: 'tipster-singola', legs: [{ fixtureId: 'sm-' + i, competition: i % 2 ? 'Serie A' : 'Serie B', market: i % 3 ? 'over25' : 'home', odds, bookmaker: 'Snai', kickoff: '2026-11-0' + (1 + i % 9) + 'T20:00:00Z' }], odds, p: 0.5, result: res, createdAt: '2026-11-0' + (1 + i % 9) + 'T08:00:00Z', closeP, ...extra });

test('performance: yield, CLV and verdict', () => {
  const rs = Array.from({ length: 40 }, (_, i) => rec(i, i % 2 ? 'won' : 'lost', 2.1, 0.5 + (i % 5) * 0.004));
  const p = performance(rs);
  assert.equal(p.n, 40); assert.equal(p.won, 20);
  assert.ok(Math.abs(p.yield - 0.05) < 1e-9);
  assert.ok(p.clv > 0.05 && p.clvN === 40 && p.verdict === 'bravura');
  assert.equal(performance([]).verdict, 'nessuna');
  assert.equal(performance(rs.slice(0, 5)).verdict, 'presto');
});
test('segments flag leagues to cut and to push', () => {
  const rs = [...Array.from({ length: 30 }, (_, i) => rec(2 * i + 1, 'won', 2.0, 0.55)), ...Array.from({ length: 30 }, (_, i) => rec(2 * i, 'lost', 2.0, 0.45))];
  const s = segments(rs);
  // Too few bets: no verdict, whatever the CLV (12 per league is noise).
  const few = segments(rs.filter((_, i) => i % 30 < 12));
  assert.equal(few.league.find(x => x.key === 'Serie B').flag, null);
  assert.equal(s.league.find(x => x.key === 'Serie A').flag, 'spingi');
  assert.equal(s.league.find(x => x.key === 'Serie B').flag, 'taglia');
  assert.equal(oddsBand(2.0), '1,90–2,29');
});
test('streaks compared with chance', () => {
  const rs = Array.from({ length: 30 }, (_, i) => rec(i, i < 12 ? 'lost' : 'won', 2.0, null, { createdAt: '2026-11-01T' + String(i).padStart(2, '0') + ':00:00Z' }));
  const s = streaks(rs, 500);
  assert.equal(s.worst, 12); assert.equal(s.verdict, 'anomala');
  const ok = streaks(Array.from({ length: 30 }, (_, i) => rec(i, i % 2 ? 'won' : 'lost', 2.0, null)), 500);
  assert.equal(ok.verdict, 'normale');
});
const mk = (pH, itH, extra = {}) => ({ home: { pSharp: pH, pMarket: pH, books: 10, it: { Snai: itH, Sisal: itH - 0.05 }, bestOdds: itH, pBlend: pH }, draw: { pSharp: 0.27, pMarket: 0.27, books: 10, it: { Snai: 3.4, Sisal: 3.3 } }, away: { pSharp: 1 - pH - 0.27, pMarket: 1 - pH - 0.27, books: 10, it: { Snai: 4.0, Sisal: 3.9 } }, itAt: { Snai: '2026-11-25T11:00:00Z' }, ...extra });
const row = (id, pH, itH) => ({ fixture_id: id, fixture: 'A – B', competition: 'Serie A', kickoff: '2026-11-26T20:00:00Z', markets: mk(pH, itH) });
test('movements find steam and opportunities carry the checklist', () => {
  const rows = [row('sm-1', 0.52, 2.10)], open = new Map([['sm-1', { at: '2026-11-24T10:00:00Z', markets: mk(0.48, 2.10) }]]);
  const mv = movements(rows, open, new Map(), now);
  assert.equal(mv[0].kind, 'steam'); assert.equal(mv[0].market, 'home'); assert.ok(Math.abs(mv[0].dOpen - 0.04) < 1e-9);
  const o = opportunities(rows, mv, null, { equityCents: 5000, capBps: 500 }, now);
  assert.equal(o.list.length, 1); const x = o.list[0];
  assert.ok(x.edge > 0.09 && x.checks.find(c => c.id === 'move').ok === true && x.checks.find(c => c.id === 'fresh').ok === true);
  assert.ok(['A', 'B'].includes(x.grade) && x.units > 0 && x.units <= 5 && x.stakeCents >= 100);
});
test('margins per bookmaker', () => {
  const m = margins([row('sm-1', 0.5, 2.0), row('sm-2', 0.5, 2.0)]);
  assert.deepEqual(m.books, ['Sisal', 'Snai']);
  const snai = m.table[0].avg.Snai; assert.ok(Math.abs(snai - (1 / 2 + 1 / 3.4 + 1 / 4 - 1)) < 1e-9);
});
test('sales goal: the method is on sale only with a measured edge', async () => {
  const { salesGoal } = await import('../lib/tipster-center.ts');
  const t = Date.parse('2026-12-01T12:00:00Z');
  const no = salesGoal({ n: 120, clv: 0.025, clvN: 110, tClv: 1.4, units: 3 }, t);
  assert.equal(no.reached, false); assert.equal(no.phase, 'prima-fase');
  const yes = salesGoal({ n: 310, clv: 0.021, clvN: 300, tClv: 2.3, units: 12 }, t);
  assert.equal(yes.reached, true); assert.equal(yes.phase, 'raggiunto');
  assert.equal(salesGoal({ n: 310, clv: 0.021, clvN: 300, tClv: 2.3, units: -1 }, t).reached, false);
  assert.equal(salesGoal({ n: 200, clv: 0.01, clvN: 190, tClv: 1, units: 0 }, Date.parse('2027-04-10T00:00:00Z')).phase, 'proroga');
});
