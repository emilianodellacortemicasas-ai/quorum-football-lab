// Automatic tickets (singles that double the stake and accumulators) built from the latest predictions.
// Pure logic: input = per-match markets with blended probability and best price.
const LABELS: Record<string, string> = { home: '1 · Casa', draw: 'X · Pareggio', away: '2 · Ospite', over15: 'Over 1,5', under15: 'Under 1,5', over25: 'Over 2,5', under25: 'Under 2,5', over35: 'Over 3,5', under35: 'Under 3,5', btts: 'Goal', noGoal: 'No Goal' };

export type Leg = { fixtureId: string; fixture: string; competition: string; kickoff: string; market: string; label: string; p: number; odds: number; bookmaker: string; edge: number };
export type Ticket = { kind: string; title: string; description: string; legs: Leg[]; odds: number; p: number; ev: number; kelly: number };
type MatchRow = { fixture_id: string; fixture: string; competition: string; kickoff: string; markets: Record<string, any> };

const KEYS = ['home', 'draw', 'away', 'over15', 'under15', 'over25', 'under25', 'over35', 'under35', 'btts', 'noGoal'];
export function candidates(matches: MatchRow[], now = Date.now()): Leg[] {
  const out: Leg[] = [];
  for (const m of matches) {
    if (Date.parse(m.kickoff) <= now + 10 * 60000) continue;
    for (const k of KEYS) {
      const x = m.markets?.[k];
      if (!x || !Number.isFinite(x.pBlend) || !Number.isFinite(x.bestOdds) || x.bestOdds <= 1 || (x.books ?? 0) < 3) continue;
      out.push({ fixtureId: m.fixture_id, fixture: m.fixture, competition: m.competition, kickoff: m.kickoff, market: k, label: LABELS[k], p: x.pBlend, odds: x.bestOdds, bookmaker: x.bookmaker, edge: x.pBlend * x.bestOdds - 1 });
    }
  }
  return out;
}

const ticket = (kind: string, title: string, description: string, legs: Leg[]): Ticket => {
  const odds = legs.reduce((s, l) => s * l.odds, 1), p = legs.reduce((s, l) => s * l.p, 1), ev = p * odds - 1;
  const kelly = ev > 0 ? Math.min(0.02, (ev / (odds - 1)) * 0.25) : 0;
  return { kind, title, description, legs: [...legs].sort((a, b) => a.kickoff.localeCompare(b.kickoff)), odds, p, ev, kelly };
};
// Best leg per match under a filter (one leg per match: same-match legs are correlated).
function perMatch(c: Leg[], ok: (l: Leg) => boolean, score: (l: Leg) => number) {
  const best = new Map<string, Leg>();
  for (const l of c) if (ok(l)) { const b = best.get(l.fixtureId); if (!b || score(l) > score(b)) best.set(l.fixtureId, l); }
  return [...best.values()].sort((a, b) => score(b) - score(a));
}
// Exhaustive search over small pools: best combination by probability within an odds window.
function bestCombo(pool: Leg[], sizes: number[], minOdds: number, maxOdds: number, score: (legs: Leg[]) => number) {
  let best: Leg[] | null = null, bestScore = -Infinity;
  const visit = (start: number, legs: Leg[], odds: number) => {
    if (odds > maxOdds) return;
    if (sizes.includes(legs.length) && odds >= minOdds) { const s = score(legs); if (s > bestScore) { bestScore = s; best = [...legs]; } }
    if (legs.length >= Math.max(...sizes)) return;
    for (let i = start; i < pool.length; i++) visit(i + 1, [...legs, pool[i]], odds * pool[i].odds);
  };
  visit(0, [], 1);
  return best as Leg[] | null;
}
const prob = (legs: Leg[]) => legs.reduce((s, l) => s * l.p, 1);
const ev = (legs: Leg[]) => prob(legs) * legs.reduce((s, l) => s * l.odds, 1);

export function buildTickets(matches: MatchRow[], now = Date.now()) {
  const c = candidates(matches, now);
  // 1. Raddoppi con la singola: quota 1,80–2,40, ordinati per valore e poi probabilità.
  const singles = perMatch(c, l => l.odds >= 1.8 && l.odds <= 2.4 && l.p >= 0.42, l => l.edge + l.p * 0.01).slice(0, 6)
    .map(l => ticket('raddoppio-singola', 'Raddoppio · singola', 'Una sola partita a quota circa 2: se vince raddoppi la puntata.', [l]));
  const tickets: Ticket[] = [];
  // 2. Raddoppio in multipla: 2–3 esiti molto probabili, quota totale 1,90–2,30, massima probabilità.
  const safe = perMatch(c, l => l.p >= 0.68 && l.odds >= 1.15 && l.odds <= 1.65, l => l.p).slice(0, 18);
  const r = bestCombo(safe, [2, 3], 1.9, 2.3, prob);
  if (r) tickets.push(ticket('raddoppio-multipla', 'Raddoppio · multipla', '2–3 esiti ad alta probabilità che insieme fanno circa quota 2.', r));
  // 3. Multipla prudente: 3–4 esiti, quota 2,5–4.
  const prudent = bestCombo(safe, [3, 4], 2.5, 4, prob);
  if (prudent) tickets.push(ticket('prudente', 'Multipla prudente', 'Quota media, gli esiti più solidi del turno.', prudent));
  // 4. Multipla di valore: solo esiti con valore positivo, 3–4 eventi, massimo valore atteso.
  const value = perMatch(c, l => l.edge > 0.01 && l.odds >= 1.4 && l.odds <= 3.2, l => l.edge).slice(0, 14);
  const v = bestCombo(value, [3, 4], 3, 20, ev);
  if (v) tickets.push(ticket('valore', 'Multipla di valore', 'Solo esiti dove la quota paga più della probabilità stimata.', v));
  // 5. Multipla ambiziosa: 4–6 eventi, quota 10–25, massima probabilità.
  const wide = perMatch(c, l => l.p >= 0.5 && l.odds >= 1.3 && l.odds <= 2.6, l => l.p + Math.max(0, l.edge)).slice(0, 16);
  const a = bestCombo(wide, [4, 5, 6], 10, 25, prob);
  if (a) tickets.push(ticket('ambiziosa', 'Multipla ambiziosa', 'Quota alta: vince raramente, punta poco.', a));
  // 6. Bomba della settimana: 5–8 eventi su tutta la settimana, quota 50–200.
  // Solo esiti con probabilità ≥ 45% e mai contro il mercato: preferiti quelli con valore positivo.
  const bombPool = perMatch(c, l => l.p >= 0.45 && l.odds >= 1.55 && l.odds <= 3.6 && l.edge > -0.03, l => l.p * (1 + Math.max(0, l.edge) * 2)).slice(0, 18);
  const b = bestCombo(bombPool, [5, 6, 7, 8], 50, 200, legs => Math.log(prob(legs)) + 0.5 * Math.log(ev(legs)));
  const bomb = b ? ticket('bomba', 'Bomba della settimana', 'Quota altissima per sbancare: 5–8 esiti scelti tra le partite della settimana con la probabilità più alta per quella quota. Vince di rado: punta solo una piccola cifra.', b) : null;
  return { singles, tickets, bomb, candidates: c.length };
}
