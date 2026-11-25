import test from 'node:test';
import { analyze } from '../lib/math.ts';
import assert from 'node:assert/strict';
import { scoreMatrix, multigolP, exactPicks } from '../lib/exact.ts';
test('score matrix matches the blended 1X2 and sums to 1', () => {
  const sc = scoreMatrix(1.6, 1.1, -0.05, { home: 0.5, draw: 0.27, away: 0.23 });
  const sum = sc.reduce((a, s) => a + s.p, 0), home = sc.filter(s => s.home > s.away).reduce((a, s) => a + s.p, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9); assert.ok(Math.abs(home - 0.5) < 0.01);
  assert.ok(sc[0].p < 0.25, 'a single exact score never reaches 65%');
  assert.ok(multigolP(sc, 1, 4) > 0.65);
});
test('exact picks cover 65% with a group of scores', () => {
  const [e] = exactPicks([{ fixture_id: 'x', fixture: 'A – B', competition: 'Serie A', kickoff: '2026-11-29T14:00:00Z', lambda_home: 1.4, lambda_away: 1.0, markets: {} }]);
  assert.ok(e.cover65 && e.cover65.p >= 0.65 && e.cover65.scores.length >= 4);
});
import { comboProbs, comboWins, comboTickets } from '../lib/exact.ts';
test('combo probabilities are coherent and tickets use different matches', () => {
  const sc = scoreMatrix(1.8, 0.9, 0, { home: 0.55, draw: 0.25, away: 0.2, under25: 0.5 });
  const c = Object.fromEntries(comboProbs(sc).map(x => [x.name, x.p]));
  assert.ok(c['1X + Under 3,5'] < 0.8 && c['1X + Under 3,5'] > c['1 + Under 3,5']);
  assert.ok(comboWins('1 + Over 1,5', 2, 0) && !comboWins('1 + Over 1,5', 1, 0) && comboWins('No Goal + Under 2,5', 1, 0));
  const rows = ['a', 'b', 'c', 'd', 'e'].map(id => ({ fixture_id: id, fixture: id, competition: 'Serie A', kickoff: '2099-01-01T15:00:00Z', lambda_home: 1.7, lambda_away: 0.8, markets: {} }));
  const t = comboTickets(exactPicks(rows), Date.UTC(2026, 10, 22));
  const ids = t.tickets.flatMap(x => x.legs.map(l => l.fixtureId));
  assert.equal(new Set(ids).size, ids.length);
});
import { lambdasFromMarket } from '../lib/exact.ts';
test('expected goals from market odds reproduce the market', () => {
  const l = lambdasFromMarket({ home: 0.5, draw: 0.26, away: 0.24, over25: 0.52 });
  const k = analyze(l.lh, l.la, 0).markets;
  assert.ok(Math.abs(k.home - 0.5) < 0.03 && Math.abs(k.over25 - 0.52) < 0.03);
});

import { customComboP, partProb, scorerShare, comboAvailability } from '../lib/exact.ts';
import { outcome } from '../lib/settle-contract.ts';
test('double chance, team and half-time Multigol combos', () => {
  const sc = scoreMatrix(1.6, 1.1, 0);
  const c = Object.fromEntries(comboProbs(sc).map(x => [x.name, x.p]));
  // only the combos offered by Lottomatica / Planetwin365
  assert.ok(c['1 + Multigol 1-3'] > 0 && c['1 + Multigol 1-3'] < c['1 + Multigol 1-4']);
  assert.ok(c['X2 + Over 1,5 1° tempo'] > 0 && c['1X + Over 1,5'] > 0);
  assert.equal(c['X2 + Multigol 1° tempo 0-2'], undefined); assert.equal(c['1X + Multigol 1-3'], undefined);
  assert.equal(comboAvailability(['X2', 'Over 1,5 1° tempo']), 'combo');
  assert.equal(comboAvailability(['Over 2,5', '1']), 'combo');
  assert.equal(comboAvailability(['1', 'Over 2,5', 'Goal'], 1), 'super');
  assert.equal(comboAvailability(['X2', 'Multigol 1° tempo 0-2']), null);
  assert.ok(comboWins('X2 + Over 1,5 1° tempo', 1, 1, [1, 1]) && !comboWins('X2 + Over 1,5 1° tempo', 1, 1, [1, 0]));
  assert.ok(comboWins('1X + Multigol casa 1-2', 2, 2) && !comboWins('1X + Multigol casa 1-2', 3, 0));
  assert.ok(comboWins('12 + Multigol 1° tempo 1-2', 2, 1, [1, 0]) && !comboWins('12 + Multigol 1° tempo 1-2', 2, 1, null));
  // half-time part: binomial over the goals of the final score, sums to 1 over complementary ranges
  assert.ok(Math.abs(partProb('Multigol 1° tempo 0-1', { home: 2, away: 1 }) + partProb('Multigol 1° tempo 2-3', { home: 2, away: 1 }) - 1) < 1e-9);
  // custom combo = sum over the matrix; a scorer can only lower it
  const base = customComboP(sc, ['1X', 'Over 1,5']), withS = customComboP(sc, ['1X', 'Over 1,5'], [{ side: 'home', share: scorerShare(0.4, 1.6) }]);
  assert.ok(Math.abs(base - c['1X + Over 1,5']) < 1e-9 && withS < base && withS > 0);
  // the scorer alone reproduces his probability
  assert.ok(Math.abs(customComboP(sc, [], [{ side: 'home', share: scorerShare(0.4, 1.6) }]) - 0.4) < 0.02);
});
test('settles custom combos with scorers and half-time', () => {
  const f = { hg: 2, ag: 1, corners: null, yellow: null, red: null, penAwarded: null, penMissed: null, scorers: [11, 22], ht: [1, 1] };
  assert.equal(outcome('combo:1X + Over 1,5 + scorer=11', f), 'won');
  assert.equal(outcome('combo:1X + scorer=33', f), 'lost');
  assert.equal(outcome('combo:1 + Multigol 1° tempo 1-2', f), 'won');
  assert.equal(outcome('combo:1 + Multigol 1° tempo 1-2', { ...f, ht: null }), null);
  assert.equal(outcome('combo:2 + Multigol ospite 1-2', f), 'lost');
});
