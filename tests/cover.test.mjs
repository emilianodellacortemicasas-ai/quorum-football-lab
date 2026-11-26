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
