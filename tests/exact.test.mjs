import test from 'node:test';
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
