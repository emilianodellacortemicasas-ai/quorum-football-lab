// Tipster method (professional bettors): play only when the Italian price is higher than the real probability.
// Real probability = Pinnacle without margin (the sharp reference); the average of the market when Pinnacle is missing.
// Only singles and doubles, stake = quarter Kelly with a cap. Pure logic.
import type { Leg, Ticket } from './tickets.ts';

const LABELS: Record<string, string> = { home: '1 · Casa', draw: 'X · Pareggio', away: '2 · Ospite', homeDraw: '1X', drawAway: 'X2', homeAway: '12', over15: 'Over 1,5', under15: 'Under 1,5', over25: 'Over 2,5', under25: 'Under 2,5', over35: 'Over 3,5', under35: 'Under 3,5', btts: 'Goal', noGoal: 'No Goal' };
export const TIP_MIN_EDGE = 0.03;
export type TipLeg = Leg & { pTrue: number; source: 'Pinnacle' | 'Media mercato'; modelAgrees: boolean | null; stake: number; all: Record<string, number>; ageH: number | null };
type Row = { fixture_id: string; fixture: string; competition: string; kickoff: string; markets: Record<string, any> };

function truth(mk: Record<string, any>, key: string): { p: number; source: TipLeg['source'] } | null {
  const pair: Record<string, [string, string]> = { homeDraw: ['home', 'draw'], drawAway: ['draw', 'away'], homeAway: ['home', 'away'] };
  if (pair[key]) { const [a, b] = pair[key], x = truth(mk, a), y = truth(mk, b); return x && y ? { p: x.p + y.p, source: x.source === 'Pinnacle' && y.source === 'Pinnacle' ? 'Pinnacle' : 'Media mercato' } : null; }
  const m = mk[key]; if (!m) return null;
  if (Number.isFinite(m.pSharp)) return { p: m.pSharp, source: 'Pinnacle' };
  return Number.isFinite(m.pMarket) && (m.books ?? 0) >= 5 ? { p: m.pMarket, source: 'Media mercato' } : null;
}
const kelly = (p: number, o: number, cap: number) => { const e = p * o - 1; return e > 0 ? Math.min(cap, 0.25 * e / (o - 1)) : 0; };

export type Check = { fixture: string; competition: string; kickoff: string; label: string; odds: number; bookmaker: string; fair: number; edge: number; source: string };
export function tipsterPicks(rows: Row[], now = Date.now()) {
  const legs: TipLeg[] = [], checks: Check[] = []; let compared = 0;
  for (const r of rows) {
    const t = Date.parse(r.kickoff); if (t <= now + 10 * 60000 || t > now + 7 * 86400000) continue;
    for (const key of Object.keys(LABELS)) {
      const it = r.markets?.[key]?.it as Record<string, number> | undefined; if (!it || !Object.keys(it).length) continue;
      const tr = truth(r.markets, key); if (!tr) continue;
      const best = Object.entries(it).sort((a, b) => b[1] - a[1])[0], odds = best[1];
      if (odds < 1.4 || odds > 4) continue;
      const edge = tr.p * odds - 1; compared++;
      // Above +25% it is almost always a data error (inverted teams, wrong market, old price), never a real gift.
      if (edge > 0.25) continue;
      if (edge < TIP_MIN_EDGE) { if (edge > -0.04) checks.push({ fixture: r.fixture, competition: r.competition, kickoff: r.kickoff, label: LABELS[key], odds, bookmaker: best[0], fair: 1 / tr.p, edge, source: tr.source }); continue; }
      // Stale prices: the Italian price is refreshed less often than the market. A pick is valid only if
      // the price is recent (≤ 14h for Lottomatica, ≤ 74h for the others) and not far above the best European price
      // (an Italian book paying 4% more than every European book is almost always an old quote).
      const at = (r.markets.itAt as Record<string, string> | undefined)?.[best[0]], ageH = at ? (now - Date.parse(at)) / 3600000 : null;
      if (ageH !== null && ageH > (best[0] === 'Lottomatica' || best[0] === 'Planetwin365' ? 14 : 74)) continue;
      const eu = r.markets[key]?.bestOdds; if (Number.isFinite(eu) && odds > eu * 1.04) continue;
      const pB = r.markets[key]?.pBlend;
      // Without Pinnacle the average of the market is weaker: the model must agree too.
      if (tr.source === 'Media mercato' && !(Number.isFinite(pB) && pB * odds - 1 > 0)) continue;
      legs.push({ fixtureId: r.fixture_id, fixture: r.fixture, competition: r.competition, kickoff: r.kickoff, market: key, label: LABELS[key], p: tr.p, odds, bookmaker: Object.entries(it).filter(x => x[1] === odds).map(x => x[0]).join(' / '), edge, se: Math.sqrt(tr.p * (1 - tr.p) / 200), italian: true,
        pTrue: tr.p, source: tr.source, modelAgrees: Number.isFinite(pB) ? pB * odds - 1 > 0 : null, stake: kelly(tr.p, odds, 0.02), all: Object.fromEntries(Object.entries(it).filter(([b]) => b !== 'Planetwin365')), ageH });
    }
  }
  // One pick per match (the one with most value), best first.
  const byMatch = new Map<string, TipLeg>();
  for (const l of legs) { const b = byMatch.get(l.fixtureId); if (!b || l.edge > b.edge) byMatch.set(l.fixtureId, l); }
  const singles = [...byMatch.values()].sort((a, b) => b.edge - a.edge).slice(0, 12);
  // Doubles: two value picks with real probability ≥ 45%, different matches; best combined value, matches not reused.
  const base = singles.filter(l => l.pTrue >= 0.45), doubles: { legs: TipLeg[]; odds: number; p: number; edge: number; stake: number }[] = [];
  const pairs: { legs: TipLeg[]; odds: number; p: number; edge: number }[] = [];
  for (let i = 0; i < base.length; i++) for (let j = i + 1; j < base.length; j++) { const o = base[i].odds * base[j].odds, p = base[i].pTrue * base[j].pTrue; pairs.push({ legs: [base[i], base[j]], odds: o, p, edge: p * o - 1 }); }
  const used = new Set<string>();
  for (const x of pairs.sort((a, b) => b.edge - a.edge)) { if (doubles.length >= 3) break; if (x.legs.some(l => used.has(l.fixtureId))) continue; x.legs.forEach(l => used.add(l.fixtureId)); doubles.push({ ...x, stake: kelly(x.p, x.odds, 0.01) }); }
  const near = checks.sort((a, b) => b.edge - a.edge).filter((c, i, a) => a.findIndex(x => x.fixture === c.fixture) === i).slice(0, 10);
  return { singles, doubles, compared, matches: new Set(rows.filter(r => Date.parse(r.kickoff) > now + 10 * 60000).map(r => r.fixture_id)).size, near };
}

// Tickets to record (to measure the method on real results): the odds stay the ones of the first proposal.
export function tipsterTickets(t: ReturnType<typeof tipsterPicks>): [string, Ticket][] {
  const mk = (kind: string, title: string, legs: TipLeg[], odds: number, p: number): Ticket => ({ kind, title, description: '', legs, odds, p, ev: p * odds - 1, kelly: 0, low: p, high: p, italian: true });
  return [...t.singles.map(l => ['tipster:' + l.fixtureId + ':' + l.market, mk('tipster-singola', 'Tipster · singola', [l], l.odds, l.pTrue)] as [string, Ticket]),
    ...t.doubles.map(d => ['tipster2:' + d.legs.map(l => l.fixtureId + ':' + l.market).join('+'), mk('tipster-doppia', 'Tipster · doppia', d.legs, d.odds, d.p)] as [string, Ticket])];
}
