// Ticket backtest with real historical prices: each week the model is refitted on earlier matches only,
// the probabilities are blended with the market (football-data.co.uk average odds) exactly like the live
// scanner, the same ticket builder composes the tickets, and they are settled with the real results.
import { analyze } from './math.ts';
import { fitLeague, lambdas, type Result } from './model-v2.ts';
import { buildTickets, type SystemTicket, type Ticket } from './tickets.ts';
import { needsHT, MULTIGOL, comboBombs, comboProbs, comboWins, exactPicks, multigolP, scoreMatrix } from './exact.ts';
import type { FdRow } from './football-data-contract.ts';

const WEEK = 7 * 86400000;
export type KindStat = { kind: string; title: string; group: string; n: number; won: number; hit: number; expected: number; roi: number | null; avgOdds: number; avgLegs: number };
const legWon = (l: Ticket['legs'][number], res: Map<string, Result>) => {
  const r = res.get(l.fixtureId)!, tot = r.hg + r.ag;
  switch (l.market) {
    case 'home': return r.hg > r.ag; case 'draw': return r.hg === r.ag; case 'away': return r.hg < r.ag;
    case 'homeDraw': return r.hg >= r.ag; case 'drawAway': return r.hg <= r.ag; case 'homeAway': return r.hg !== r.ag;
    case 'over25': return tot >= 3; case 'under25': return tot < 3; default: return false;
  }
};
const won = (t: Ticket, res: Map<string, Result>) => t.legs.every(l => legWon(l, res));
// Profit of a system per 1 unit staked per combination, in units.
function systemProfit(s: SystemTicket, res: Map<string, Result>) {
  const w = s.legs.map(l => legWon(l, res)); let cost = 0, ret = 0;
  for (const c of s.classes) {
    const visit = (start: number, picked: number[]) => {
      if (picked.length === c.k) { cost++; if (picked.every(i => w[i])) ret += picked.reduce((q, i) => q * s.legs[i].odds, 1); return; }
      for (let i = start; i < s.legs.length; i++) visit(i + 1, [...picked, i]);
    };
    visit(0, []);
  }
  return { cost, ret, profitable: ret > cost };
}
// Groups shown in the weekly backtest of the overview.
export const groupOf = (kind: string) => kind.startsWith('raddoppio-sicuro') ? 'Raddoppi' : kind.startsWith('fascia-') ? 'Schedine 3–5 squadre' : kind.startsWith('multipla-giorno') ? 'Multiple del giorno'
  : kind.startsWith('sistema') ? 'Sistemi del giorno' : kind.startsWith('schema-') ? 'Schemi settimanali' : kind.startsWith('bomba') ? 'Bombe' : kind.startsWith('esatto') || kind.startsWith('multigol') || kind.startsWith('combo') ? 'Risultati esatti e combo' : 'Altre';

export function ticketBacktest(results: Result[], odds: Map<string | number, FdRow>, testDays = 240, now = Date.now(), W = 0.35) {
  const comps = [...new Set(results.map(r => r.comp))].filter(c => !['Coppa Italia', 'Champions League', 'Europa League'].includes(c));
  const stats = new Map<string, { title: string; n: number; won: number; p: number; profit: number; odds: number; legs: number; staked: number; noOdds?: boolean }>();
  const series: { week: string; groups: Record<string, number> }[] = [];
  // Every market QUORUM predicts: when it said ≥ 60% (and 45–60%), how often it really happened.
  // 1X2 and Under/Over 2,5 also have the historical average price: return betting 1 unit on each ≥ 60% pick.
  const mstats = new Map<string, { group: string; label: string; n: number; won: number; p: number; hn: number; hwon: number; hp: number; mn: number; mwon: number; mp: number; profit: number; priced: number }>();
  const mAdd = (group: string, label: string, p: number, win: boolean, price?: number | null) => {
    const s0 = mstats.get(label) ?? { group, label, n: 0, won: 0, p: 0, hn: 0, hwon: 0, hp: 0, mn: 0, mwon: 0, mp: 0, profit: 0, priced: 0 };
    s0.n++; s0.p += p; if (win) s0.won++;
    if (p >= 0.6) { s0.hn++; s0.hp += p; if (win) s0.hwon++; if (price) { s0.priced++; s0.profit += win ? price - 1 : -1; } }
    else if (p >= 0.45) { s0.mn++; s0.mp += p; if (win) s0.mwon++; }
    mstats.set(label, s0);
  };
  const add = (kind: string, title: string, p: number, odds: number, legs: number, win: boolean, profit: number, staked: number, noOdds = false) => {
    const s = stats.get(kind) ?? { title, n: 0, won: 0, p: 0, profit: 0, odds: 0, legs: 0, staked: 0, noOdds }; s.n++; s.p += p; s.odds += odds; s.legs += legs; s.staked += staked; s.profit += profit; if (win) s.won++; stats.set(kind, s);
    if (!noOdds) { const g = groupOf(kind), wk = series[series.length - 1]; wk.groups[g] = (wk.groups[g] ?? 0) + profit; }
  };
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
        rows.push({ fixture_id: id, fixture: r.home + ' – ' + r.away, competition: comp, kickoff: new Date(r.ts).toISOString(), markets: mk, _l: { lh: l.lh, la: l.la, rho: m.rho } });
      }
    }
    if (!rows.length) continue;
    weeks++; matches += rows.length;
    series.push({ week: new Date(t).toISOString().slice(0, 10), groups: {} });
    const b = buildTickets(rows, t - 3600000);
    const all = [...b.singles, ...b.tickets, ...b.probable, ...b.sure, ...b.banded, ...b.bombs.map(x => ({ ...x, kind: 'bomba-giorno' })), ...b.multiples.map(x => ({ ...x, kind: 'multipla-giorno-' + x.legs.length })), ...(b.bomb ? [b.bomb] : [])];
    for (const tk of all) { const w = won(tk, res); add(tk.kind, tk.title, tk.p, tk.odds, tk.legs.length, w, w ? tk.odds - 1 : -1, 1); }
    for (const sy of [...b.systems.map(x => ({ ...x, kind: 'sistema-giorno', title: 'Sistema del giorno' })), ...b.schemes]) {
      const r = systemProfit(sy, res); add(sy.kind, sy.kind === 'sistema-giorno' ? sy.title : sy.title, sy.pProfit, r.ret / r.cost, sy.legs.length, r.profitable, r.ret - r.cost, r.cost);
    }
    // Combo bombs of each match day (fair prices only: calibration of the probability).
    const ex = exactPicks(rows.map(r0 => ({ ...r0, lambda_home: r0._l.lh, lambda_away: r0._l.la, markets: { ...r0.markets, meta: { rho: r0._l.rho } } })));
    for (const cb of comboBombs(ex.map(e0 => ({ ...e0, combos: e0.combos.filter(c => !needsHT(c.name)) })), t - 3600000)) add('bomba-combo', 'Bomba combo', cb.p, cb.fair, cb.legs.length, cb.legs.every(l => { const r1 = res.get(l.fixtureId)!; return comboWins(l.label, r1.hg, r1.ag); }), 0, 1, true);
    // Exact score and Multigol: calibration only (no historical prices for these markets).
    for (const row of rows) {
      const r = res.get(row.fixture_id)!, l = row._l as { lh: number; la: number; rho: number }, mk = row.markets;
      const sc = scoreMatrix(l.lh, l.la, l.rho, { home: mk.home.pBlend, draw: mk.draw.pBlend, away: mk.away.pBlend, ...(mk.under25 ? { under25: mk.under25.pBlend } : {}) });
      const cb = comboProbs(sc).filter(c => !needsHT(c.name)).filter(c => c.p >= 0.55 && 1 / c.p >= 1.4).sort((x, y) => y.p - x.p)[0];
      if (cb) add('combo-55', 'Combo più probabile', cb.p, 1 / cb.p, 1, comboWins(cb.name, r.hg, r.ag), 0, 1, true);
      add('esatto-top', 'Risultato esatto più probabile', sc[0].p, 1 / sc[0].p, 1, sc[0].home === r.hg && sc[0].away === r.ag, 0, 1, true);
      const tot = r.hg + r.ag, best = MULTIGOL.map(([lo, hi]) => ({ lo, hi, p: multigolP(sc, lo, hi) })).filter(x => x.hi - x.lo <= 2 && x.p >= 0.65).sort((x, y) => y.p - x.p)[0];
      if (best) add('multigol-65', 'Multigol al 65% o più', best.p, 1 / best.p, 1, tot >= best.lo && tot <= best.hi, 0, 1, true);
      // Per market.
      const o = odds.get(r.id) as FdRow, P = (f: (h: number, a: number) => boolean) => sc.filter(x => f(x.home, x.away)).reduce((q, x) => q + x.p, 0);
      const res3 = [['1', (h: number, a: number) => h > a, o.h], ['X', (h: number, a: number) => h === a, o.d], ['2', (h: number, a: number) => h < a, o.a]] as const;
      for (const [lab, f, price] of res3) mAdd('Esito finale', lab, P(f), f(r.hg, r.ag), price);
      for (const [lab, f] of [['1X', (h: number, a: number) => h >= a], ['X2', (h: number, a: number) => h <= a], ['12', (h: number, a: number) => h !== a]] as const) mAdd('Doppia chance', lab, P(f), f(r.hg, r.ag));
      for (const line of [0.5, 1.5, 2.5, 3.5, 4.5]) {
        const pO = P((h, a) => h + a > line), L = String(line).replace('.', ',');
        mAdd('Under / Over', 'Over ' + L, pO, tot > line, line === 2.5 ? o.o25 ?? undefined : undefined);
        mAdd('Under / Over', 'Under ' + L, 1 - pO, tot < line, line === 2.5 ? o.u25 ?? undefined : undefined);
      }
      const pG = P((h, a) => h > 0 && a > 0); mAdd('Goal / No Goal', 'Goal', pG, r.hg > 0 && r.ag > 0); mAdd('Goal / No Goal', 'No Goal', 1 - pG, r.hg === 0 || r.ag === 0);
      for (const c of comboProbs(sc).filter(c => !needsHT(c.name))) mAdd('Combo', c.name, c.p, comboWins(c.name, r.hg, r.ag));
      for (const [lo, hi] of MULTIGOL) mAdd('Multigol', 'Multigol ' + lo + '-' + hi, multigolP(sc, lo, hi), tot >= lo && tot <= hi);
      mAdd('Risultato esatto', 'Risultato più probabile', sc[0].p, sc[0].home === r.hg && sc[0].away === r.ag);
    }
  }
  const byKind: KindStat[] = [...stats.entries()].map(([kind, s]) => ({ kind, title: s.title, group: groupOf(kind), n: s.n, won: s.won, hit: s.won / s.n, expected: s.p / s.n, roi: s.noOdds ? null : s.profit / s.staked, avgOdds: s.odds / s.n, avgLegs: s.legs / s.n }));
  const markets = [...mstats.values()].map(m => ({ group: m.group, label: m.label, n: m.n, hit: m.won / m.n, expected: m.p / m.n, high: m.hn ? { n: m.hn, hit: m.hwon / m.hn, expected: m.hp / m.hn, roi: m.priced >= 20 ? m.profit / m.priced : null } : null, mid: m.mn ? { n: m.mn, hit: m.mwon / m.mn, expected: m.mp / m.mn } : null }));
  return { at: new Date(now).toISOString(), testDays, weeks, matches, byKind, markets, series: series.filter(x => Object.keys(x.groups).length) };
}
