// Exact scores and Multigol from the score matrix of the model, rescaled so that 1, X and 2 match the
// blended (model + market) probabilities used everywhere else. Pure logic.
import { analyze } from './math.ts';

export const MULTIGOL: [number, number][] = [[1, 2], [2, 3], [1, 3], [2, 4], [0, 2], [3, 5], [1, 4], [2, 5]];
export type ScoreProb = { score: string; p: number };
export type ExactPick = { fixtureId: string; fixture: string; competition: string; kickoff: string; top: ScoreProb[]; multigol: { range: string; p: number }[]; cover65: { scores: string[]; p: number } | null };

export function scoreMatrix(lh: number, la: number, rho: number, blend?: { home: number; draw: number; away: number }) {
  const a = analyze(lh, la, rho), m = a.markets;
  const f = blend ? { h: blend.home / m.home, d: blend.draw / m.draw, a: blend.away / m.away } : { h: 1, d: 1, a: 1 };
  const out = a.scores.map(s => ({ home: s.home, away: s.away, p: s.p * (s.home > s.away ? f.h : s.home === s.away ? f.d : f.a) }));
  const tot = out.reduce((x, y) => x + y.p, 0);
  return out.map(s => ({ ...s, p: s.p / tot })).sort((x, y) => y.p - x.p);
}
export const multigolP = (sc: { home: number; away: number; p: number }[], lo: number, hi: number) => sc.filter(s => s.home + s.away >= lo && s.home + s.away <= hi).reduce((x, y) => x + y.p, 0);

export function exactPicks(rows: { fixture_id: string; fixture: string; competition: string; kickoff: string; lambda_home: number | null; lambda_away: number | null; markets: Record<string, any> }[]): ExactPick[] {
  const out: ExactPick[] = [];
  for (const r of rows) {
    if (!Number.isFinite(r.lambda_home) || !Number.isFinite(r.lambda_away)) continue;
    const mk = r.markets || {}, b = ['home', 'draw', 'away'].map(k => mk[k]?.pBlend);
    const blend = b.every(x => Number.isFinite(x) && x > 0) ? { home: b[0], draw: b[1], away: b[2] } : undefined;
    const sc = scoreMatrix(r.lambda_home!, r.lambda_away!, mk.meta?.rho ?? 0, blend);
    const top = sc.slice(0, 3).map(s => ({ score: s.home + '-' + s.away, p: s.p }));
    const multigol = MULTIGOL.map(([lo, hi]) => ({ range: lo + '-' + hi, p: multigolP(sc, lo, hi) })).sort((x, y) => y.p - x.p);
    // Smallest group of exact scores that together reach 65%.
    let acc = 0; const pick: string[] = [];
    for (const s of sc) { if (acc >= 0.65 || pick.length >= 8) break; pick.push(s.home + '-' + s.away); acc += s.p; }
    out.push({ fixtureId: r.fixture_id, fixture: r.fixture, competition: r.competition, kickoff: r.kickoff, top, multigol, cover65: acc >= 0.65 ? { scores: pick, p: acc } : null });
  }
  return out;
}
