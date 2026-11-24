// Exact scores and Multigol from the score matrix of the model, rescaled so that 1, X and 2 match the
// blended (model + market) probabilities used everywhere else. Pure logic.
import { analyze } from './math.ts';

export const MULTIGOL: [number, number][] = [[1, 2], [2, 3], [1, 3], [2, 4], [0, 2], [3, 5], [1, 4], [2, 5]];
export type ScoreProb = { score: string; p: number; it?: { book: string; odds: number } | null };
export type ExactPick = { fixtureId: string; fixture: string; competition: string; kickoff: string; top: ScoreProb[]; multigol: { range: string; p: number }[]; cover65: { scores: string[]; p: number } | null; combos: { name: string; p: number }[] };

// The model's score matrix adjusted (iterative proportional fitting) so that 1-X-2 and, when known,
// Under/Over 2,5 match the blended probabilities used everywhere else in QUORUM.
export function scoreMatrix(lh: number, la: number, rho: number, blend?: { home: number; draw: number; away: number; under25?: number }) {
  let out = analyze(lh, la, rho).scores.map(s => ({ home: s.home, away: s.away, p: s.p }));
  const res = (s: { home: number; away: number }) => s.home > s.away ? 'home' : s.home === s.away ? 'draw' : 'away';
  for (let it = 0; it < (blend ? 8 : 0); it++) {
    for (const k of ['home', 'draw', 'away'] as const) { const cur = out.filter(s => res(s) === k).reduce((x, y) => x + y.p, 0); if (cur > 0) out = out.map(s => res(s) === k ? { ...s, p: s.p * blend![k] / cur } : s); }
    if (blend!.under25 !== undefined && blend!.under25 > 0 && blend!.under25 < 1) {
      const u = out.filter(s => s.home + s.away <= 2).reduce((x, y) => x + y.p, 0);
      out = out.map(s => ({ ...s, p: s.p * (s.home + s.away <= 2 ? blend!.under25! / u : (1 - blend!.under25!) / (1 - u)) }));
    }
  }
  const tot = out.reduce((x, y) => x + y.p, 0);
  return out.map(s => ({ ...s, p: s.p / tot })).sort((x, y) => y.p - x.p);
}
// Combo markets: every part must happen. Parts: result / double chance (1, X, 2, 1X, X2, 12), total goals
// (Over / Under x,5), Goal / No Goal, Multigol a-b, team goals (Casa / Ospite Over / Under x,5).
type Sc = { home: number; away: number; p: number };
const R: Record<string, (s: Sc) => boolean> = { '1': s => s.home > s.away, 'X': s => s.home === s.away, '2': s => s.home < s.away, '1X': s => s.home >= s.away, 'X2': s => s.home <= s.away, '12': s => s.home !== s.away };
export const RESULT_PARTS = ['1', 'X', '2', '1X', 'X2', '12'];
export const GOAL_PARTS = ['Over 1,5', 'Over 2,5', 'Over 3,5', 'Under 1,5', 'Under 2,5', 'Under 3,5', 'Under 4,5', 'Goal', 'No Goal', ...MULTIGOL.map(([a, b]) => 'Multigol ' + a + '-' + b)];
export const TEAM_PARTS = ['Casa Over 0,5', 'Casa Over 1,5', 'Casa Under 1,5', 'Ospite Over 0,5', 'Ospite Over 1,5', 'Ospite Under 1,5'];
export const TEAM_MULTIGOL: [number, number][] = [[1, 2], [1, 3], [2, 3], [0, 1], [2, 4]];
export const TEAM_MG_PARTS = (['casa', 'ospite'] as const).flatMap(t => TEAM_MULTIGOL.map(([a, b]) => 'Multigol ' + t + ' ' + a + '-' + b));
export const HT_MULTIGOL: [number, number][] = [[0, 1], [1, 2], [1, 3], [2, 3], [0, 2]];
export const HT_PARTS = HT_MULTIGOL.map(([a, b]) => 'Multigol 1° tempo ' + a + '-' + b);
// Half-time goals: each goal of the match falls in the first half with probability HT_SHARE (≈ 45% in the top leagues).
export const HT_SHARE = 0.45;
export const htRange = (part: string): [number, number] | null => { const m = /^Multigol 1° tempo (\d+)-(\d+)$/.exec(part); return m ? [Number(m[1]), Number(m[2])] : null; };
const binom = (n: number, k: number) => { let c = 1; for (let i = 1; i <= k; i++) c = c * (n - k + i) / i; return c; };
// Probability that a part happens given the final score (0/1, or binomial for half-time parts).
export function partProb(part: string, s: { home: number; away: number }): number | null {
  const h = htRange(part);
  if (h) { const n = s.home + s.away; let p = 0; for (let k = h[0]; k <= Math.min(h[1], n); k++) p += binom(n, k) * HT_SHARE ** k * (1 - HT_SHARE) ** (n - k); return p; }
  const t = partTest(part); return t ? (t(s) ? 1 : 0) : null;
}
export function partTest(part: string): ((s: { home: number; away: number }) => boolean) | null {
  if (R[part]) return R[part] as any;
  if (part === 'Goal') return s => s.home > 0 && s.away > 0;
  if (part === 'No Goal') return s => s.home === 0 || s.away === 0;
  let m = /^(Over|Under) (\d+),5$/.exec(part);
  if (m) { const l = Number(m[2]) + 0.5, o = m[1] === 'Over'; return s => o ? s.home + s.away > l : s.home + s.away < l; }
  m = /^Multigol (\d+)-(\d+)$/.exec(part);
  if (m) { const a = Number(m[1]), b = Number(m[2]); return s => s.home + s.away >= a && s.home + s.away <= b; }
  m = /^Multigol (casa|ospite) (\d+)-(\d+)$/.exec(part);
  if (m) { const a = Number(m[2]), b = Number(m[3]), h = m[1] === 'casa'; return s => { const g = h ? s.home : s.away; return g >= a && g <= b; }; }
  m = /^(Casa|Ospite) (Over|Under) (\d+),5$/.exec(part);
  if (m) { const l = Number(m[3]) + 0.5, o = m[2] === 'Over', h = m[1] === 'Casa'; return s => { const g = h ? s.home : s.away; return o ? g > l : g < l; }; }
  return null;
}
// Ready-made combos: every result / double chance with every goals part, plus Goal + Over 2,5 and No Goal + Under 2,5.
export const COMBOS: [string, string][] = RESULT_PARTS.flatMap(r => [...GOAL_PARTS, ...TEAM_MG_PARTS, ...HT_PARTS].map(g => [r, g] as [string, string]));
export const goalCombos: [string, (s: Sc) => boolean][] = [['Goal + Over 2,5', s => s.home > 0 && s.away > 0 && s.home + s.away >= 3], ['No Goal + Under 2,5', s => (s.home === 0 || s.away === 0) && s.home + s.away <= 2]];
export function comboProbs(sc: Sc[]) {
  const out: { name: string; p: number }[] = [];
  for (const [r, g] of COMBOS) out.push({ name: r + ' + ' + g, p: sc.filter(s => R[r](s)).reduce((x, y) => x + y.p * (partProb(g, y) ?? 0), 0) });
  for (const [name, f] of goalCombos) out.push({ name, p: sc.filter(f).reduce((x, y) => x + y.p, 0) });
  return out;
}
// The slot (family) of a ready-made combo, used to show them in order: 1 / X / 2 / 1X / X2 / 12 / Goal.
export const comboSlot = (name: string) => { const r = name.split(' + ')[0]; return R[r] ? r : 'Gol'; };
export const comboWins = (name: string, hg: number, ag: number, ht?: [number, number] | null) => {
  const parts = name.split(' + '), s = { home: hg, away: ag };
  return parts.length > 0 && parts.every(p => { const h = htRange(p); if (h) { if (!ht) return false; const g = ht[0] + ht[1]; return g >= h[0] && g <= h[1]; } const f = partTest(p); return !!f && f(s); });
};
// Backtests have no half-time score: they skip half-time combos.
export const needsHT = (name: string) => name.includes('1° tempo');
// Probability of a custom combo. Scorer parts: { share, side } where share is the player's share of his team's
// goals; given a score the player scores with probability 1 − (1 − share)^goals of his team.
export type ScorerPart = { side: 'home' | 'away'; share: number };
export function customComboP(sc: Sc[], parts: string[], scorers: ScorerPart[] = []) {
  if (parts.some(x => partProb(x, { home: 0, away: 0 }) === null)) return null;
  let p = 0;
  for (const s of sc) {
    let q = s.p;
    for (const x of parts) { q *= partProb(x, s)!; if (!q) break; }
    if (!q) continue;
    for (const x of scorers) q *= 1 - Math.pow(1 - x.share, x.side === 'home' ? s.home : s.away);
    p += q;
  }
  return p;
}
// Player's share of the team's goals from his anytime-scorer probability and the team's expected goals.
export const scorerShare = (pScorer: number, teamLambda: number) => teamLambda > 0 && pScorer > 0 && pScorer < 1 ? Math.min(0.95, -Math.log(1 - pScorer) / teamLambda) : 0;
export const multigolP = (sc: { home: number; away: number; p: number }[], lo: number, hi: number) => sc.filter(s => s.home + s.away >= lo && s.home + s.away <= hi).reduce((x, y) => x + y.p, 0);

export function exactPicks(rows: { fixture_id: string; fixture: string; competition: string; kickoff: string; lambda_home: number | null; lambda_away: number | null; markets: Record<string, any> }[]): ExactPick[] {
  const out: ExactPick[] = [];
  for (const r of rows) {
    if (!Number.isFinite(r.lambda_home) || !Number.isFinite(r.lambda_away)) continue;
    const mk = r.markets || {}, b = ['home', 'draw', 'away'].map(k => mk[k]?.pBlend);
    const u = mk.under25?.pBlend, blend = b.every(x => Number.isFinite(x) && x > 0) ? { home: b[0], draw: b[1], away: b[2], ...(Number.isFinite(u) ? { under25: u } : {}) } : undefined;
    const sc = scoreMatrix(r.lambda_home!, r.lambda_away!, mk.meta?.rho ?? 0, blend);
    const itx = mk.itExact as Record<string, Record<string, number>> | undefined;
    const itOf = (k: string) => { const q = itx?.[k]; if (!q) return null; const b = Object.entries(q).sort((x, y) => y[1] - x[1])[0]; return b ? { book: b[0], odds: b[1] } : null; };
    const top = sc.slice(0, 3).map(s => ({ score: s.home + '-' + s.away, p: s.p, it: itOf(s.home + '-' + s.away) }));
    const multigol = MULTIGOL.map(([lo, hi]) => ({ range: lo + '-' + hi, p: multigolP(sc, lo, hi) })).sort((x, y) => y.p - x.p);
    // Smallest group of exact scores that together reach 65%.
    let acc = 0; const pick: string[] = [];
    for (const s of sc) { if (acc >= 0.65 || pick.length >= 8) break; pick.push(s.home + '-' + s.away); acc += s.p; }
    out.push({ fixtureId: r.fixture_id, fixture: r.fixture, competition: r.competition, kickoff: r.kickoff, top, multigol, cover65: acc >= 0.65 ? { scores: pick, p: acc } : null, combos: comboProbs(sc).sort((x, y) => y.p - x.p) });
  }
  return out;
}

// Ready-made combo tickets: the most probable combo of each match (real probability ≥ 55% and fair price ≥ 1,40,
// otherwise it is not worth a combo), then 2 and 3 of them on different matches.
export function comboTickets(list: ExactPick[], now = Date.now()) {
  const best = list.filter(e => Date.parse(e.kickoff) > now + 10 * 60000).map(e => ({ e, c: e.combos.filter(c => c.p >= 0.55 && 1 / c.p >= 1.4).sort((a, b) => b.p - a.p)[0] })).filter(x => x.c).sort((a, b) => b.c!.p - a.c!.p);
  const pick = (n: number, skip: Set<string>) => { const legs = best.filter(x => !skip.has(x.e.fixtureId)).slice(0, n); return legs.length === n ? legs : null; };
  const used = new Set<string>(), tickets: { kind: string; title: string; legs: { fixtureId: string; fixture: string; kickoff: string; combo: string; p: number }[]; p: number; fair: number }[] = [];
  for (const [n, title] of [[2, 'Doppia combo'], [3, 'Tripla combo'], [2, 'Doppia combo #2']] as const) {
    const legs = pick(n, used); if (!legs) continue; legs.forEach(x => used.add(x.e.fixtureId));
    const p = legs.reduce((q, x) => q * x.c!.p, 1);
    tickets.push({ kind: 'combo-' + n, title, legs: legs.map(x => ({ fixtureId: x.e.fixtureId, fixture: x.e.fixture, kickoff: x.e.kickoff, combo: x.c!.name, p: x.c!.p })), p, fair: 1 / p });
  }
  // Slots: per family (1, X, 2, 1X, X2, 12, Gol) the most probable combo of each match, best matches first.
  const live = list.filter(e => Date.parse(e.kickoff) > now + 10 * 60000);
  const slots = ['1X', 'X2', '12', '1', 'X', '2', 'Gol'].map(slot => ({ slot, items: live.map(e => ({ e, c: e.combos.filter(c => comboSlot(c.name) === slot && c.p >= (slot === 'X' ? 0.12 : 0.4) && 1 / c.p >= 1.3).sort((a, b) => b.p - a.p)[0] })).filter(x => x.c).sort((a, b) => b.c!.p - a.c!.p).slice(0, 12)
    .map(x => ({ fixtureId: x.e.fixtureId, fixture: x.e.fixture, competition: x.e.competition, kickoff: x.e.kickoff, combo: x.c!.name, p: x.c!.p, others: x.e.combos.filter(c => comboSlot(c.name) === slot && c.name !== x.c!.name && c.p >= 0.35).slice(0, 3) })) })).filter(x => x.items.length);
  return { top: best.slice(0, 12).map(x => ({ fixtureId: x.e.fixtureId, fixture: x.e.fixture, competition: x.e.competition, kickoff: x.e.kickoff, combo: x.c!.name, p: x.c!.p, others: x.e.combos.filter(c => c.name !== x.c!.name && c.p >= 0.5).slice(0, 3) })), tickets, slots };
}

// Combo bombs: one per match day, built only with combos (result + goals). For each match the 2 most probable
// combos at fair price 1,30–2,30; the search picks the most probable set in the day's odds window
// (full day ≥ 8 matches: 40–100, otherwise 10–30). Prices are fair prices: the bookmaker's must be higher.
export type ComboBomb = { kind: string; day: string; title: string; legs: { fixtureId: string; fixture: string; kickoff: string; market: string; label: string; p: number; odds: number }[]; p: number; fair: number };
export function comboBombs(list: ExactPick[], now = Date.now()): ComboBomb[] {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }), dayOf = (iso: string) => fmt.format(new Date(iso));
  const soon = list.filter(e => { const t = Date.parse(e.kickoff); return t > now + 10 * 60000 && t - now <= 96 * 3600000; });
  const days = [...new Set(soon.map(e => dayOf(e.kickoff)))].sort().slice(0, 4), out: ComboBomb[] = [];
  for (const d of days) {
    const today = soon.filter(e => dayOf(e.kickoff) === d), big = today.length >= 8, [lo, hi] = big ? [40, 100] : [10, 30], sizes = big ? [5, 6, 7, 8] : [3, 4, 5, 6];
    // For each size n every leg needs about lo^(1/n) as fair price: per match the most probable combo at or above
    // that price, then the n most probable matches; the size with the highest total probability wins.
    let best: { e: ExactPick; c: { name: string; p: number } }[] | null = null, bestP = 0;
    for (const n of sizes) {
      const need = Math.pow(lo * 1.05, 1 / n);
      const legs = today.map(e => ({ e, c: e.combos.filter(c => 1 / c.p >= need && 1 / c.p <= Math.max(need * 1.6, 2.3)).sort((a, b) => b.p - a.p)[0] })).filter(x => x.c).sort((a, b) => b.c!.p - a.c!.p).slice(0, n) as { e: ExactPick; c: { name: string; p: number } }[];
      if (legs.length < n) continue;
      const odds = legs.reduce((q, x) => q / x.c.p, 1), p = 1 / odds;
      if (odds >= lo && odds <= hi && p > bestP) { bestP = p; best = legs; }
    }
    if (!best) continue;
    const legs = best.map(x => ({ fixtureId: x.e.fixtureId, fixture: x.e.fixture, kickoff: x.e.kickoff, market: 'combo:' + x.c.name, label: x.c.name, p: x.c.p, odds: 1 / x.c.p })).sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    const label = new Date(d + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    out.push({ kind: 'bomba-combo-' + d, day: d, title: 'Bomba combo di ' + label, legs, p: bestP, fair: 1 / bestP });
  }
  return out;
}

// Goals expected by the market, when the model has no history (European cups: teams from different leagues).
// Searches the two Poisson means whose 1-X-2 and Under/Over 2,5 best match the market probabilities.
export function lambdasFromMarket(m: { home: number; draw: number; away: number; over25?: number }): { lh: number; la: number } | null {
  if (![m.home, m.draw, m.away].every(x => Number.isFinite(x) && x > 0)) return null;
  let best: { lh: number; la: number } | null = null, err = Infinity;
  const tryAt = (lh: number, la: number) => {
    if (lh < 0.2 - 1e-9 || la < 0.2 - 1e-9 || lh > 4.01 || la > 4.01) return;
    const k = analyze(lh, la, 0).markets;
    const e = (k.home - m.home) ** 2 + (k.draw - m.draw) ** 2 + (k.away - m.away) ** 2 + (Number.isFinite(m.over25) ? (k.over25 - m.over25!) ** 2 : 0);
    if (e < err) { err = e; best = { lh: Math.round(lh * 100) / 100, la: Math.round(la * 100) / 100 }; }
  };
  // Coarse grid (step 0,25), then a fine search (step 0,05) around the best point: same result, ~15× faster.
  for (let lh = 0.2; lh <= 4.01; lh += 0.25) for (let la = 0.2; la <= 4.01; la += 0.25) tryAt(lh, la);
  const c = best as { lh: number; la: number } | null; if (!c) return null;
  for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) tryAt(c.lh + i * 0.05, c.la + j * 0.05);
  return best;
}

// Goalscorer picks of the ready-made tickets: every player QUORUM knows, with the bookmaker's price when present.
export function scorerPicks(rows: { fixture_id: string; fixture: string; competition: string; kickoff: string; markets: Record<string, any> }[], now = Date.now()) {
  const out: { fixtureId: string; fixture: string; competition: string; kickoff: string; id: number; name: string; team: string; p: number; odds: number | null; book: string | null; italian: boolean; value: number | null }[] = [];
  for (const r of rows) {
    if (Date.parse(r.kickoff) <= now + 10 * 60000) continue;
    const mk = r.markets || {}, meta = mk.meta?.scorers, [home, away] = r.fixture.split(' – ');
    for (const side of ['home', 'away'] as const) for (const pl of (Array.isArray(meta?.[side]) ? meta[side] : [])) {
      if (!Number.isFinite(pl?.p) || !pl.id) continue;
      const real = mk['scorer:' + pl.id], it = real?.it ? Object.entries<number>(real.it).sort((a, b) => b[1] - a[1])[0] : null;
      const p = Number.isFinite(real?.pBlend) ? real.pBlend : pl.p, odds = it ? it[1] : Number.isFinite(real?.bestOdds) ? real.bestOdds : null;
      out.push({ fixtureId: r.fixture_id, fixture: r.fixture, competition: r.competition, kickoff: r.kickoff, id: pl.id, name: pl.name, team: (side === 'home' ? home : away) || '', p, odds, book: it ? it[0] : odds ? real.bookmaker ?? null : null, italian: !!it, value: odds ? p * odds - 1 : null });
    }
  }
  return out.filter(x => x.p >= 0.18).sort((a, b) => b.p - a.p).slice(0, 40);
}
