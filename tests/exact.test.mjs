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
