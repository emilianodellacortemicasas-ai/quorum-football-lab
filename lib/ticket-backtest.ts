// Ticket backtest with real historical prices: each week the model is refitted on earlier matches only,
// the probabilities are blended with the market (football-data.co.uk average odds) exactly like the live
// scanner, the same ticket builder composes the tickets, and they are settled with the real results.
import { analyze } from './math';
import { fitLeague, lambdas, type Result } from './model-v2';
import { buildTickets, type Ticket } from './tickets.ts';
import type { FdRow } from './football-data-contract.ts';

const WEEK = 7 * 86400000;
export type KindStat = { kind: string; title: string; n: number; won: number; hit: number; expected: number; roi: number; avgOdds: number; avgLegs: number };
const won = (t: Ticket, res: Map<string, Result>) => t.legs.every(l => {
  const r = res.get(l.fixtureId)!, tot = r.hg + r.ag;
  switch (l.market) {
    case 'home': return r.hg > r.ag; case 'draw': return r.hg === r.ag; case 'away': return r.hg < r.ag;
    case 'homeDraw': return r.hg >= r.ag; case 'drawAway': return r.hg <= r.ag; case 'homeAway': return r.hg !== r.ag;
    case 'over25': return tot >= 3; case 'under25': return tot < 3; default: return false;
  }
});

export function ticketBacktest(results: Result[], odds: Map<string | number, FdRow>, testDays = 240, now = Date.now(), W = 0.35) {
  const comps = [...new Set(results.map(r => r.comp))].filter(c => c !== 'Coppa Italia');
  const stats = new Map<string, { title: string; n: number; won: number; p: number; profit: number; odds: number; legs: number }>();
  let weeks = 0, matches = 0;
  for (let t = now - testDays * 86400000; t < now - WEEK / 2; t += WEEK) {
    const rows: any[] = [], res = new Map<string, Result>();
    for (const comp of comps) {
      const rs = results.filter(r => r.comp === comp), train = rs.filter(r => r.ts < t), test = rs.filter(r => r.ts >= t && r.ts < t + WEEK && odds.has(r.id));
      if (!test.length) continue;
      const m = fitLeague(train, t); if (!m) continue;
      for (const r of test) {
        const l = lambdas(m, r.homeId, r.awayId), o = odds.get(r.id)!; if (!l) continue;
        const k = analyze(l.lh, l.la, m.rho).markets, inv = 1 / o.h + 1 / o.d + 1 / o.a;
        const mk: Record<string, any> = {}, put = (key: string, pm: number, pMk: number, price: number) => { mk[key] = { pModel: pm, pMarket: pMk, pBlend: W * pm + (1 - W) * pMk, bestOdds: price, books: 8, it: { Media: price } }; };
        put('home', k.home, 1 / o.h / inv, o.h); put('draw', k.draw, 1 / o.d / inv, o.d); put('away', k.away, 1 / o.a / inv, o.a);
        // Double chance price derived from the 1X2 prices (same margin): conservative approximation.
        put('homeDraw', k.home + k.draw, (1 / o.h + 1 / o.d) / inv, 1 / (1 / o.h + 1 / o.d));
        put('drawAway', k.draw + k.away, (1 / o.d + 1 / o.a) / inv, 1 / (1 / o.d + 1 / o.a));
        put('homeAway', k.home + k.away, (1 / o.h + 1 / o.a) / inv, 1 / (1 / o.h + 1 / o.a));
        if (o.o25 && o.u25) { const iou = 1 / o.o25 + 1 / o.u25; put('over25', k.over25, 1 / o.o25 / iou, o.o25); put('under25', k.under25, 1 / o.u25 / iou, o.u25); }
        const id = 'bt-' + r.id; res.set(id, r);
        rows.push({ fixture_id: id, fixture: r.home + ' – ' + r.away, competition: comp, kickoff: new Date(r.ts).toISOString(), markets: mk });
      }
    }
    if (!rows.length) continue;
    weeks++; matches += rows.length;
    const b = buildTickets(rows, t - 3600000);
    const all = [...b.singles, ...b.tickets, ...b.probable, ...b.sure, ...b.banded, ...b.bombs.map(x => ({ ...x, kind: 'bomba-giorno' })), ...(b.bomb ? [b.bomb] : [])];
    for (const tk of all) {
      const s = stats.get(tk.kind) ?? { title: tk.title, n: 0, won: 0, p: 0, profit: 0, odds: 0, legs: 0 }, w = won(tk, res);
      s.n++; s.p += tk.p; s.odds += tk.odds; s.legs += tk.legs.length; if (w) { s.won++; s.profit += tk.odds - 1; } else s.profit -= 1;
      stats.set(tk.kind, s);
    }
  }
  const byKind: KindStat[] = [...stats.entries()].map(([kind, s]) => ({ kind, title: s.title, n: s.n, won: s.won, hit: s.won / s.n, expected: s.p / s.n, roi: s.profit / s.n, avgOdds: s.odds / s.n, avgLegs: s.legs / s.n }));
  return { at: new Date(now).toISOString(), testDays, weeks, matches, byKind };
}
