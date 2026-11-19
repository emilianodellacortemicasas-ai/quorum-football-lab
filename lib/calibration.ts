// Measured calibration: "when QUORUM says p, how often does it actually happen?"
// Built from walk-forward backtest samples (model probabilities) and, as results come in, from settled
// scanner rows (final QUORUM probabilities). Pure logic, no imports.
export type Family = '1x2' | 'gol' | 'gg';
export type Sample = { f: Family; p: number; hit: boolean };
export type Bucket = { from: number; to: number; n: number; predicted: number; hit: number };
export type CalTable = Record<Family, Bucket[]>;

export const familyOf = (key: string): Family | null =>
  key === 'home' || key === 'draw' || key === 'away' ? '1x2'
    : /^(over|under)(15|25|35)$/.test(key) ? 'gol'
      : key === 'btts' || key === 'noGoal' ? 'gg' : null;

const EDGES = Array.from({ length: 21 }, (_, i) => i * 0.05); // 0, 0.05 … 1
const PRIOR = 40; // pseudo-samples pulling each bucket towards "the probability is right"

export function buildTable(samples: Sample[]): CalTable {
  const out = {} as CalTable;
  for (const f of ['1x2', 'gol', 'gg'] as Family[]) {
    const s = samples.filter(x => x.f === f), rows: Bucket[] = [];
    for (let i = 0; i < EDGES.length - 1; i++) {
      const from = EDGES[i], to = EDGES[i + 1], b = s.filter(x => x.p >= from && (x.p < to || (to === 1 && x.p <= 1)));
      if (!b.length) continue;
      rows.push({ from, to, n: b.length, predicted: b.reduce((a, x) => a + x.p, 0) / b.length, hit: b.filter(x => x.hit).length / b.length });
    }
    out[f] = rows;
  }
  return out;
}

// Shrunk, monotone points (predicted → observed) used for interpolation.
function points(rows: Bucket[]) {
  const pts = rows.map(r => ({ x: r.predicted, y: (r.n * r.hit + PRIOR * r.predicted) / (r.n + PRIOR), n: r.n }));
  // pool-adjacent-violators: observed frequency must not decrease when the prediction increases
  const blocks: { x: number; y: number; n: number }[] = [];
  for (const p of pts) {
    blocks.push({ ...p });
    while (blocks.length > 1 && blocks[blocks.length - 2].y > blocks[blocks.length - 1].y) {
      const b = blocks.pop()!, a = blocks.pop()!, w = a.n + b.n + 2 * PRIOR;
      blocks.push({ x: (a.x * (a.n + PRIOR) + b.x * (b.n + PRIOR)) / w, y: (a.y * (a.n + PRIOR) + b.y * (b.n + PRIOR)) / w, n: a.n + b.n });
    }
  }
  return blocks;
}

// Calibrated probability and its measured uncertainty (one standard error) for a raw probability.
export function calibrate(p: number, f: Family | null, table: CalTable | null | undefined): { p: number; se: number; n: number } {
  const rows = f && table?.[f];
  if (!rows || !rows.length || !Number.isFinite(p)) return { p, se: Math.sqrt(p * (1 - p) / PRIOR), n: 0 };
  const pts = points(rows);
  let y: number, n: number;
  if (p <= pts[0].x) { y = p + (pts[0].y - pts[0].x); n = pts[0].n; }
  else if (p >= pts[pts.length - 1].x) { const l = pts[pts.length - 1]; y = p + (l.y - l.x); n = l.n; }
  else {
    const i = pts.findIndex(q => q.x >= p), a = pts[i - 1], b = pts[i], t = (p - a.x) / (b.x - a.x || 1);
    y = a.y + t * (b.y - a.y); n = Math.round(a.n + t * (b.n - a.n));
  }
  y = Math.min(0.99, Math.max(0.01, y));
  return { p: y, se: Math.sqrt(y * (1 - y) / (n + PRIOR)), n };
}

// Reliability of an accumulator: product of calibrated legs, with a band from the legs' uncertainty
// (relative errors add in quadrature for a product of independent legs).
export function ticketReliability(legs: { p: number; se: number }[]) {
  const p = legs.reduce((s, l) => s * l.p, 1);
  const rel = Math.sqrt(legs.reduce((s, l) => s + (l.se / Math.max(l.p, 0.01)) ** 2, 0));
  return { p, low: Math.max(0, p * (1 - rel)), high: Math.min(1, p * (1 + rel)) };
}
