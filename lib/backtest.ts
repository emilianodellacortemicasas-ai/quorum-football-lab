// Walk-forward backtest: the model is refitted every week using only matches played before that week,
// then scored on the following week's matches. No information from the future is used.
import { analyze } from './math';
import { buildTable, familyOf, type CalTable, type Sample } from './calibration.ts';
import { fitLeague, lambdas, type FitOptions, type LeagueModel, type Result } from './model-v2';

export type BtConfig = FitOptions & { scale?: number; label?: string };
export type BtMetrics = {
  label: string; n: number;
  logLoss1x2: number; brier1x2: number; acc1x2: number; baseLogLoss1x2: number;
  logLossOU: number; accOU: number; predOver: number; realOver: number;
  logLossBTTS: number; accBTTS: number; predBTTS: number; realBTTS: number;
  predGoals: number; realGoals: number;
  buckets: { from: number; to: number; n: number; predicted: number; hit: number }[];
  calibration: CalTable; samples: number;
};
const clamp = (p: number) => Math.min(1 - 1e-6, Math.max(1e-6, p));

export function backtest(results: Result[], cfg: BtConfig, testDays = 150, now = Date.now()): BtMetrics {
  const label = cfg.label || JSON.stringify(cfg);
  const comps = [...new Set(results.map(r => r.comp))].filter(c => !['Coppa Italia', 'Champions League', 'Europa League'].includes(c));
  const start = now - testDays * 86400000;
  let n = 0, ll = 0, br = 0, acc = 0, base = 0, llOU = 0, accOU = 0, pO = 0, rO = 0, llB = 0, accB = 0, pB = 0, rB = 0, pG = 0, rG = 0;
  const tips: { p: number; hit: boolean }[] = [], samples: Sample[] = [];
  for (let t = start; t < now; t += 7 * 86400000) {
    for (const comp of comps) {
      const rs = results.filter(r => r.comp === comp), train = rs.filter(r => r.ts < t), test = rs.filter(r => r.ts >= t && r.ts < t + 7 * 86400000);
      if (!test.length) continue;
      const m: LeagueModel | null = fitLeague(train, t, cfg);
      if (!m) continue;
      if (cfg.scale !== undefined) m.scale = cfg.scale;
      // baseline: league frequencies of 1/X/2 in the training window
      const recent = train.filter(r => r.ts > t - 365 * 86400000), bn = recent.length || 1;
      const bh = recent.filter(r => r.hg > r.ag).length / bn, bd = recent.filter(r => r.hg === r.ag).length / bn, ba = 1 - bh - bd;
      for (const r of test) {
        const l = lambdas(m, r.homeId, r.awayId); if (!l) continue;
        const k = analyze(l.lh, l.la, m.rho).markets, out = r.hg > r.ag ? 0 : r.hg === r.ag ? 1 : 2, probs = [k.home, k.draw, k.away];
        n++; ll += -Math.log(clamp(probs[out])); base += -Math.log(clamp([bh, bd, ba][out]));
        br += probs.reduce((s, p, i) => s + (p - (i === out ? 1 : 0)) ** 2, 0);
        if (probs.indexOf(Math.max(...probs)) === out) acc++;
        const over = r.hg + r.ag >= 3, btts = r.hg > 0 && r.ag > 0;
        llOU += -Math.log(clamp(over ? k.over25 : k.under25)); if ((k.over25 >= 0.5) === over) accOU++; pO += k.over25; rO += over ? 1 : 0;
        llB += -Math.log(clamp(btts ? k.btts : k.noGoal)); if ((k.btts >= 0.5) === btts) accB++; pB += k.btts; rB += btts ? 1 : 0;
        pG += l.lh + l.la; rG += r.hg + r.ag;
        // calibration of the strongest single outcome among 1X2 / O-U 2.5 / GG-NG
        const cands: [number, boolean][] = [[k.home, out === 0], [k.draw, out === 1], [k.away, out === 2], [k.over25, over], [k.under25, !over], [k.btts, btts], [k.noGoal, !btts]];
        const best = cands.reduce((a, c) => c[0] > a[0] ? c : a); tips.push({ p: best[0], hit: best[1] });
        // every outcome of every scanned market, for the per-family calibration
        const tot = r.hg + r.ag, hits: Record<string, boolean> = { home: out === 0, draw: out === 1, away: out === 2, over15: tot >= 2, under15: tot < 2, over25: over, under25: !over, over35: tot >= 4, under35: tot < 4, btts, noGoal: !btts };
        for (const [key, hit] of Object.entries(hits)) { const f = familyOf(key), pk = (k as any)[key]; if (f && Number.isFinite(pk)) samples.push({ f, p: pk, hit }); }
      }
    }
  }
  const d = n || 1;
  const buckets = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 1.01]].map(([from, to]) => {
    const b = tips.filter(x => x.p >= from && x.p < to);
    return { from, to, n: b.length, predicted: b.length ? b.reduce((s, x) => s + x.p, 0) / b.length : 0, hit: b.length ? b.filter(x => x.hit).length / b.length : 0 };
  });
  return { label, n, logLoss1x2: ll / d, brier1x2: br / d, acc1x2: acc / d, baseLogLoss1x2: base / d, logLossOU: llOU / d, accOU: accOU / d, predOver: pO / d, realOver: rO / d, logLossBTTS: llB / d, accBTTS: accB / d, predBTTS: pB / d, realBTTS: rB / d, predGoals: pG / d, realGoals: rG / d, buckets, calibration: buildTable(samples), samples: samples.length };
}
