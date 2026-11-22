import test from 'node:test';
import assert from 'node:assert/strict';
import { tipsterPicks } from '../lib/tipster.ts';
const now = Date.UTC(2026, 10, 22, 12);
const row = (id, home, it, pSharp) => ({ fixture_id: id, fixture: id, competition: 'Serie A', kickoff: new Date(now + 86400000).toISOString(), markets: { home: { pSharp, pMarket: pSharp, books: 10, pBlend: pSharp, bestOdds: it, it: { Lottomatica: it } }, draw: { pSharp: 0.25, pMarket: 0.25, books: 10 }, away: { pSharp: 1 - pSharp - 0.25, pMarket: 1 - pSharp - 0.25, books: 10 } } });
test('tipster: only prices above the Pinnacle fair line by 3%', () => {
  const t = tipsterPicks([row('a', 'A', 2.2, 0.5), row('b', 'B', 1.95, 0.5), row('c', 'C', 2.15, 0.5)], now);
  assert.deepEqual(t.singles.map(l => l.fixtureId), ['a', 'c']);
  assert.ok(t.singles[0].stake > 0 && t.singles[0].stake <= 0.02);
  assert.equal(t.doubles.length, 1);
  assert.ok(Math.abs(t.doubles[0].odds - 2.2 * 2.15) < 1e-9);
});
test('tipster: stale or out-of-market Italian prices are ignored', () => {
  const old = row('a', 'A', 2.2, 0.5); old.markets.itAt = { Lottomatica: new Date(now - 20 * 3600000).toISOString() };
  const far = row('b', 'B', 2.2, 0.5); far.markets.home.bestOdds = 2.0;
  assert.equal(tipsterPicks([old, far], now).singles.length, 0);
});
