import test from 'node:test';
import assert from 'node:assert/strict';
import { cupBacktest, cupPlan, trimSnapshot, snapshotPath } from '../lib/cup-backtest.ts';

const now = Date.parse('2026-11-23T12:00:00Z');
const res = (id, d, home, away, hg, ag, comp = 'Champions League') => ({ id, ts: Date.parse(d), comp, season: 1, homeId: id * 10, awayId: id * 10 + 1, home, away, hg, ag });
const book = (k, h, a, ph, pd, pa, po, pu) => ({ key: k, title: k, markets: [
  { key: 'h2h', outcomes: [{ name: h, price: ph }, { name: a, price: pa }, { name: 'Draw', price: pd }] },
  { key: 'totals', outcomes: [{ name: 'Over', point: 2.5, price: po }, { name: 'Under', point: 2.5, price: pu }] }] });
const ev = (h, a, t, ph, pd, pa, po, pu) => ({ id: h + a, home_team: h, away_team: a, commence_time: t, bookmakers: ['b1', 'b2', 'b3', 'pinnacle'].map(k => book(k, h, a, ph, pd, pa, po, pu)) });

test('one snapshot per competition and match day, only past matches', () => {
  const rs = [res(1, '2026-11-04T20:00:00Z', 'Inter', 'Arsenal', 1, 0), res(2, '2026-11-04T17:45:00Z', 'Roma', 'Celtic', 2, 2), res(3, '2026-11-06T20:00:00Z', 'Lazio', 'Porto', 1, 1, 'Europa League'), res(4, '2026-11-23T20:00:00Z', 'PSG', 'Roma', 0, 0), res(5, '2026-11-04T20:00:00Z', 'Milan', 'Juve', 1, 1, 'Serie A')];
  const plan = cupPlan(rs, now);
  assert.deepEqual(plan.map(p => p.id), ['cuphist:soccer_uefa_champs_league:2026-11-04', 'cuphist:soccer_uefa_europa_league:2026-11-06']);
  assert.match(snapshotPath(plan[0].sport, plan[0].date), /historical\/sports\/soccer_uefa_champs_league\/odds\?regions=eu&markets=h2h,totals.*date=2026-11-04T12:00:00Z/);
});

test('trimmed snapshot keeps only that day and h2h/totals', () => {
  const e1 = ev('Inter', 'Arsenal', '2026-11-04T20:00:00Z', 2.1, 3.4, 3.5, 2.0, 1.85), e2 = ev('X', 'Y', '2026-11-05T20:00:00Z', 2, 3, 4, 2, 2);
  e1.bookmakers[0].markets.push({ key: 'spreads', outcomes: [] });
  const t = trimSnapshot({ data: [e1, e2] }, '2026-11-04');
  assert.equal(t.length, 1); assert.equal(t[0].bookmakers[0].markets.length, 2);
});

test('settles markets and tickets with market-derived probabilities', () => {
  const rs = [res(1, '2026-11-04T20:00:00Z', 'Inter', 'Arsenal', 3, 0), res(2, '2026-11-04T17:45:00Z', 'Bayern', 'Celtic', 4, 1)];
  const snaps = new Map([['cuphist:soccer_uefa_champs_league:2026-11-04', [ev('Inter', 'Arsenal', '2026-11-04T20:00:00Z', 1.3, 5.5, 9.5, 1.8, 2.05), ev('Bayern', 'Celtic', '2026-11-04T17:45:00Z', 1.2, 7.5, 14, 1.4, 3.0)]]]);
  const out = cupBacktest(rs, snaps, now);
  assert.equal(out.matches, 2); assert.equal(out.considered, 2);
  const one = out.markets.find(m => m.label === '1');
  assert.equal(one.n, 2); assert.equal(one.hit, 1); assert.ok(one.expected > 0.6);
  const rad = out.byKind.find(k => k.kind === 'raddoppio-coppe');
  assert.ok(rad && rad.won === 1 && rad.roi > 0);
  const sum = out.markets.find(m => m.label === '1').expected + out.markets.find(m => m.label === 'X').expected + out.markets.find(m => m.label === '2').expected;
  assert.ok(Math.abs(sum - 1) < 1e-6);
});
