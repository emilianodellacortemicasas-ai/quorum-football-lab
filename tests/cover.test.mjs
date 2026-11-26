import test from 'node:test';
import assert from 'node:assert/strict';
import { coverPlan, opposite } from '../lib/cover.ts';

const legs = [
  { fixtureId: 'a', fixture: 'A', market: 'home', label: '1', p: 0.6, odds: 1.75 },
  { fixtureId: 'b', fixture: 'B', market: 'over25', label: 'Over 2,5', p: 0.5, odds: 2.0 },
  { fixtureId: 'c', fixture: 'C', market: 'btts', label: 'Goal', p: 0.55, odds: 1.8 },
];
const board = { 'a:drawAway': { p: 0.4, odds: 2.3 }, 'b:under25': { p: 0.5, odds: 1.8 }, 'c:noGoal': { p: 0.45, odds: 2.0 } };
const find = (f, m) => board[f + ':' + m] ? { fixtureId: f, market: m, label: m, ...board[f + ':' + m] } : null;

test('opposites', () => {
  assert.equal(opposite('home'), 'drawAway'); assert.equal(opposite('under35'), 'over35'); assert.equal(opposite('combo:1 + Over 1,5'), null);
});
test('multiple: cover on the riskiest leg gives the stake back and cuts the chance of losing everything', () => {
  const c = coverPlan(legs, 1000, find);
  assert.equal(c.cover.leg.market, 'over25');            // lowest probability (50%)
  assert.equal(c.cover.stake, 1250);                     // 10 € / (1,80 − 1) = 12,50 €
  assert.equal(c.cover.ifLegFails, 0);                   // 12,50 × 1,80 − 12,50 − 10 = 0
  assert.ok(c.cover.pLoseAll < c.none.pLoseAll);         // 0,5 × (1 − 0,33) = 0,335 vs 0,835
  assert.ok(c.cover.ifAllWin > 0 && !c.cover.pointless); // 63 € − 10 − 12,50
  assert.ok(c.cover.ev < c.none.ev);                     // the cover pays the margin again
});
test('single on an exact opposite: the cover eats the win (pointless)', () => {
  const c = coverPlan([legs[0]], 1000, find);
  assert.equal(c.cover.pointless, true);
});
test('no coverable leg', () => {
  const c = coverPlan([{ fixtureId: 'x', fixture: 'X', market: 'combo:1 + Over 1,5', label: 'combo', p: 0.4, odds: 2.5 }], 1000, find);
  assert.equal(c.cover, null); assert.ok(c.reason);
});
test('cover with a separate ticket: the Roma X2 example and the target under 30%', async () => {
  const { coverTickets } = await import('../lib/cover.ts');
  // Main multiple: 3 € at total odds ~ 9 with 10% chance (90% of losing everything).
  const main = [{ fixtureId: 'm1', fixture: 'M1', market: 'home', label: '1', p: 0.4, odds: 2.4 }, { fixtureId: 'm2', fixture: 'M2', market: 'over25', label: 'O', p: 0.25, odds: 3.75 }];
  const cands = [
    { fixtureId: 'r', fixture: 'PSG – Roma', kickoff: 'x', market: 'drawAway', label: 'X2', p: 0.45, odds: 2.6 },
    { fixtureId: 's', fixture: 'S', kickoff: 'x', market: 'homeDraw', label: '1X', p: 0.82, odds: 1.3 },
    { fixtureId: 't', fixture: 'T', kickoff: 'x', market: 'under45', label: 'U4,5', p: 0.85, odds: 1.25 },
  ];
  const r = coverTickets(main, 300, cands);
  assert.ok(r.none.pLoseAll > 0.89);
  const roma = r.options.find(o => o.legs.length === 1 && o.legs[0].fixtureId === 'r');
  assert.ok(roma, 'the value pick is proposed'); assert.equal(roma.kind, 'valore');
  assert.equal(roma.stake, 190);                      // 3 € / (2,60 − 1) = 1,875 → 1,90 €
  assert.ok(roma.coverOnly >= 0);                     // main lost, cover won: 5,20 − 5 = +0,20 €
  assert.ok(roma.ev > r.none.ev);                     // a cover with value raises the expected result
  const safe = r.options.find(o => o.kind === 'sicura');
  assert.ok(safe.pLoseAll < 0.3);                     // from 90% to under 30%
});
