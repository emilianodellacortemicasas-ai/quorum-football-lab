// Backtest of the European cups (Champions League, Europa League). For cups QUORUM has no team model:
// the live app derives the expected goals from the market (lambdasFromMarket) and builds the score matrix
// from them. Here we do exactly the same with the historical odds of The Odds API taken on the match day
// (snapshot at 12:00 UTC, before every kickoff), then settle with the real 90-minute results. Pure logic.
import { needsHT, MULTIGOL, comboProbs, comboWins, lambdasFromMarket, multigolP, scoreMatrix } from './exact.ts';
import { marketConsensus, matchEvent, type OddsEvent } from './scanner-contract.ts';
import type { Result } from './model-v2.ts';

export const CUP_SPORT: Record<string, string> = { 'Champions League': 'soccer_uefa_champs_league', 'Europa League': 'soccer_uefa_europa_league' };
export const CUP_DAYS = 400;
const day = (ts: number) => new Date(ts).toISOString().slice(0, 10);

// One snapshot per competition and match day (UTC date of kickoff).
export function cupPlan(results: Result[], now = Date.now()) {
  const out = new Map<string, { id: string; comp: string; sport: string; date: string }>();
  for (const r of results) {
    const sport = CUP_SPORT[r.comp]; if (!sport || r.ts > now - 86400000 || r.ts < now - CUP_DAYS * 86400000) continue;
    const date = day(r.ts), id = 'cuphist:' + sport + ':' + date;
    out.set(id, { id, comp: r.comp, sport, date });
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export const snapshotPath = (sport: string, date: string) => 'historical/sports/' + sport + '/odds?regions=eu&markets=h2h,totals&oddsFormat=decimal&date=' + date + 'T12:00:00Z';
// Keeps only the events of that day and the fields we need (keeps D1 rows small).
export function trimSnapshot(payload: any, date: string): OddsEvent[] {
  const list: any[] = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return list.filter(e => typeof e?.commence_time === 'string' && e.commence_time.slice(0, 10) === date).map(e => ({
    id: e.id, home_team: e.home_team, away_team: e.away_team, commence_time: e.commence_time,
    bookmakers: (e.bookmakers || []).map((b: any) => ({ key: b.key, title: b.title, markets: (b.markets || []).filter((m: any) => m.key === 'h2h' || m.key === 'totals').map((m: any) => ({ key: m.key, outcomes: m.outcomes })) })),
  }));
}
// Median price across bookmakers (a fair proxy of an average Italian price, not the best one).
function medianPrices(e: OddsEvent) {
  const acc: Record<string, number[]> = {};
  for (const b of e.bookmakers || []) for (const m of b.markets || []) for (const o of m.outcomes || []) {
    if (!Number.isFinite(o?.price) || o.price <= 1) continue;
    let k: string | null = null;
    if (m.key === 'h2h') k = o.name === e.home_team ? 'home' : o.name === e.away_team ? 'away' : o.name === 'Draw' ? 'draw' : null;
    if (m.key === 'totals' && o.point === 2.5) k = o.name === 'Over' ? 'over25' : o.name === 'Under' ? 'under25' : null;
    if (k) (acc[k] ??= []).push(o.price);
  }
  const med = (a?: number[]) => { if (!a || a.length < 3) return undefined; const s = [...a].sort((x, y) => x - y), i = s.length >> 1; return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
  return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, med(v)])) as Record<string, number | undefined>;
}

type MStat = { group: string; label: string; n: number; won: number; p: number; hn: number; hwon: number; hp: number; mn: number; mwon: number; mp: number; profit: number; priced: number };
type KStat = { title: string; group: string; n: number; won: number; p: number; profit: number; staked: number; odds: number; noOdds: boolean };

export function cupBacktest(results: Result[], snapshots: Map<string, OddsEvent[]>, now = Date.now()) {
  const mstats = new Map<string, MStat>(), kstats = new Map<string, KStat>();
  const mAdd = (group: string, label: string, p: number, win: boolean, price?: number) => {
    const s = mstats.get(label) ?? { group, label, n: 0, won: 0, p: 0, hn: 0, hwon: 0, hp: 0, mn: 0, mwon: 0, mp: 0, profit: 0, priced: 0 };
    s.n++; s.p += p; if (win) s.won++;
    if (p >= 0.6) { s.hn++; s.hp += p; if (win) s.hwon++; if (price) { s.priced++; s.profit += win ? price - 1 : -1; } }
    else if (p >= 0.45) { s.mn++; s.mp += p; if (win) s.mwon++; }
    mstats.set(label, s);
  };
  const kAdd = (kind: string, title: string, group: string, p: number, win: boolean, odds?: number) => {
    const s = kstats.get(kind) ?? { title, group, n: 0, won: 0, p: 0, profit: 0, staked: 0, odds: 0, noOdds: !odds };
    s.n++; s.p += p; if (win) s.won++; s.odds += odds ?? 1 / p;
    if (odds) { s.staked++; s.profit += win ? odds - 1 : -1; }
    kstats.set(kind, s);
  };
  const byComp: Record<string, number> = {}; let matched = 0, considered = 0;
  // Per match day: the doubles QUORUM would have built (two most probable legs ≥ 70% with a price).
  const daily = new Map<string, { p: number; odds: number; win: boolean }[]>();
  for (const r of results) {
    const sport = CUP_SPORT[r.comp]; if (!sport || r.ts > now - 86400000 || r.ts < now - CUP_DAYS * 86400000) continue;
    considered++;
    const events = snapshots.get('cuphist:' + sport + ':' + day(r.ts)); if (!events) continue;
    const e = matchEvent({ id: String(r.id), home: r.home, away: r.away, kickoff: new Date(r.ts).toISOString(), competition: r.comp }, events); if (!e) continue;
    const c = marketConsensus(e); if (!c.home || !c.draw || !c.away) continue;
    const m = { home: c.home.pMarket, draw: c.draw.pMarket, away: c.away.pMarket, over25: c.over25?.pMarket };
    const l = lambdasFromMarket(m); if (!l) continue;
    matched++; byComp[r.comp] = (byComp[r.comp] ?? 0) + 1;
    const sc = scoreMatrix(l.lh, l.la, 0, { home: m.home, draw: m.draw, away: m.away, ...(c.under25 ? { under25: c.under25.pMarket } : {}) });
    const price = medianPrices(e), tot = r.hg + r.ag, P = (f: (h: number, a: number) => boolean) => sc.filter(x => f(x.home, x.away)).reduce((q, x) => q + x.p, 0);
    const legs: { p: number; odds?: number; win: boolean }[] = [];
    for (const [lab, f, k] of [['1', (h: number, a: number) => h > a, 'home'], ['X', (h: number, a: number) => h === a, 'draw'], ['2', (h: number, a: number) => h < a, 'away']] as const) {
      const p = P(f), w = f(r.hg, r.ag); mAdd('Esito finale', lab, p, w, price[k]); legs.push({ p, odds: price[k], win: w });
    }
    for (const [lab, f] of [['1X', (h: number, a: number) => h >= a], ['X2', (h: number, a: number) => h <= a], ['12', (h: number, a: number) => h !== a]] as const) mAdd('Doppia chance', lab, P(f), f(r.hg, r.ag));
    for (const line of [0.5, 1.5, 2.5, 3.5, 4.5]) {
      const pO = P((h, a) => h + a > line), L = String(line).replace('.', ',');
      mAdd('Under / Over', 'Over ' + L, pO, tot > line, line === 2.5 ? price.over25 : undefined);
      mAdd('Under / Over', 'Under ' + L, 1 - pO, tot < line, line === 2.5 ? price.under25 : undefined);
      if (line === 2.5) { legs.push({ p: pO, odds: price.over25, win: tot > 2.5 }); legs.push({ p: 1 - pO, odds: price.under25, win: tot < 2.5 }); }
    }
    const pG = P((h, a) => h > 0 && a > 0); mAdd('Goal / No Goal', 'Goal', pG, r.hg > 0 && r.ag > 0); mAdd('Goal / No Goal', 'No Goal', 1 - pG, r.hg === 0 || r.ag === 0);
    const combos = comboProbs(sc).filter(c => !needsHT(c.name));
    for (const cb of combos) mAdd('Combo', cb.name, cb.p, comboWins(cb.name, r.hg, r.ag));
    for (const [lo, hi] of MULTIGOL) mAdd('Multigol', 'Multigol ' + lo + '-' + hi, multigolP(sc, lo, hi), tot >= lo && tot <= hi);
    mAdd('Risultato esatto', 'Risultato più probabile', sc[0].p, sc[0].home === r.hg && sc[0].away === r.ag);
    // Ticket types, same thresholds as the live "Schedine pronte".
    const cb = combos.filter(x => x.p >= 0.55 && 1 / x.p >= 1.4).sort((x, y) => y.p - x.p)[0];
    if (cb) kAdd('combo-55', 'Combo più probabile', 'Risultati esatti e combo', cb.p, comboWins(cb.name, r.hg, r.ag));
    const mg = MULTIGOL.map(([lo, hi]) => ({ lo, hi, p: multigolP(sc, lo, hi) })).filter(x => x.hi - x.lo <= 2 && x.p >= 0.65).sort((x, y) => y.p - x.p)[0];
    if (mg) kAdd('multigol-65', 'Multigol al 65% o più', 'Risultati esatti e combo', mg.p, tot >= mg.lo && tot <= mg.hi);
    kAdd('esatto-top', 'Risultato esatto più probabile', 'Risultati esatti e combo', sc[0].p, sc[0].home === r.hg && sc[0].away === r.ag);
    const single = legs.filter(x => x.odds && x.p >= 0.6).sort((a, b) => b.p - a.p)[0];
    if (single) kAdd('singola-60', 'Singola più probabile (≥ 60%)', 'Singole', single.p, single.win, single.odds);
    const best = legs.filter(x => x.odds && x.p >= 0.7).sort((a, b) => b.p - a.p)[0];
    if (best) { const d = day(r.ts); (daily.get(d) ?? daily.set(d, []).get(d)!).push({ p: best.p, odds: best.odds!, win: best.win }); }
  }
  for (const legs of daily.values()) {
    if (legs.length < 2) continue;
    const [a, b] = legs.sort((x, y) => y.p - x.p);
    kAdd('raddoppio-coppe', 'Raddoppio del giorno (2 eventi ≥ 70%)', 'Raddoppi', a.p * b.p, a.win && b.win, a.odds * b.odds);
  }
  const byKind = [...kstats.entries()].map(([kind, s]) => ({ kind, title: s.title, group: s.group, n: s.n, won: s.won, hit: s.won / s.n, expected: s.p / s.n, roi: s.noOdds || !s.staked ? null : s.profit / s.staked, avgOdds: s.odds / s.n }));
  const markets = [...mstats.values()].map(m => ({ group: m.group, label: m.label, n: m.n, hit: m.won / m.n, expected: m.p / m.n, high: m.hn ? { n: m.hn, hit: m.hwon / m.hn, expected: m.hp / m.hn, roi: m.priced >= 20 ? m.profit / m.priced : null } : null, mid: m.mn ? { n: m.mn, hit: m.mwon / m.mn, expected: m.mp / m.mn } : null }));
  return { at: new Date(now).toISOString(), days: CUP_DAYS, considered, matches: matched, byComp, byKind, markets };
}
