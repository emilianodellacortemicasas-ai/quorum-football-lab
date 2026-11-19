// Automatic tickets (singles that double the stake and accumulators) built from the latest predictions.
// Pure logic: input = per-match markets with blended probability and best price.
import { familyOf, ticketReliability } from './calibration.ts';
const LABELS: Record<string, string> = { home: '1 · Casa', draw: 'X · Pareggio', away: '2 · Ospite', over15: 'Over 1,5', under15: 'Under 1,5', over25: 'Over 2,5', under25: 'Under 2,5', over35: 'Over 3,5', under35: 'Under 3,5', btts: 'Goal', noGoal: 'No Goal', homeDraw: '1X · Doppia chance', drawAway: 'X2 · Doppia chance', homeAway: '12 · Doppia chance' };

export type Leg = { fixtureId: string; fixture: string; competition: string; kickoff: string; market: string; label: string; p: number; odds: number; bookmaker: string; edge: number; se: number; italian: boolean };
export type Ticket = { kind: string; title: string; description: string; legs: Leg[]; odds: number; p: number; ev: number; kelly: number; low: number; high: number; italian: boolean };
type MatchRow = { fixture_id: string; fixture: string; competition: string; kickoff: string; markets: Record<string, any> };

const extraLabel = (k: string) => { const [f, , ou, line] = k.split(':'); return (f === 'corners' ? 'Corner' : 'Cartellini') + ' ' + (ou === 'over' ? 'Over ' : 'Under ') + String(line).replace('.', ','); };
const KEYS = ['home', 'draw', 'away', 'homeDraw', 'drawAway', 'homeAway', 'over15', 'under15', 'over25', 'under25', 'over35', 'under35', 'btts', 'noGoal'];
export function candidates(matches: MatchRow[], now = Date.now()): Leg[] {
  const out: Leg[] = [];
  for (const m of matches) {
    if (Date.parse(m.kickoff) <= now + 10 * 60000) continue;
    for (const k of [...KEYS, ...Object.keys(m.markets || {}).filter(x => x.startsWith('corners:') || x.startsWith('cards:') || x.startsWith('scorer:'))]) {
      const x = m.markets?.[k];
      if (!x || !Number.isFinite(x.pBlend) || !Number.isFinite(x.bestOdds) || x.bestOdds <= 1 || (x.books ?? 0) < 3) continue;
      // The price you can actually play: Lottomatica / Planetwin365 when they quote the market.
      const it = x.it && Object.keys(x.it).length ? Object.entries<number>(x.it).sort((a, b) => b[1] - a[1]) : null;
      const odds = it ? it[0][1] : x.bestOdds, bookmaker = it ? it.filter(e => e[1] === it[0][1]).map(e => e[0]).join(' / ') : x.bookmaker;
      const se = Number.isFinite(x.se) ? x.se : Math.sqrt(x.pBlend * (1 - x.pBlend) / 40);
      out.push({ fixtureId: m.fixture_id, fixture: m.fixture, competition: m.competition, kickoff: m.kickoff, market: k, label: LABELS[k] ?? x.label ?? extraLabel(k), p: x.pBlend, odds, bookmaker, edge: x.pBlend * odds - 1, se, italian: !!it });
    }
  }
  return out;
}

const ticket = (kind: string, title: string, description: string, legs: Leg[]): Ticket => {
  const odds = legs.reduce((s, l) => s * l.odds, 1), r = ticketReliability(legs), p = r.p, ev = p * odds - 1;
  const kelly = ev > 0 ? Math.min(0.02, (ev / (odds - 1)) * 0.25) : 0;
  return { kind, title, description, legs: [...legs].sort((a, b) => a.kickoff.localeCompare(b.kickoff)), odds, p, ev, kelly, low: r.low, high: r.high, italian: legs.every(l => l.italian) };
};
// Variety: at most half of the legs (rounded up) on goal lines (Over/Under), so 1X2 and Goal/No Goal get space.
const isLine = (l: Leg) => familyOf(l.market) === 'gol';
const lineCap = (n: number) => Math.ceil(n / 2);
const varied = (legs: Leg[]) => legs.length < 3 || legs.filter(isLine).length <= lineCap(legs.length);
// Best leg per match under a filter (one leg per match: same-match legs are correlated).
function perMatch(c: Leg[], ok: (l: Leg) => boolean, score: (l: Leg) => number) {
  const best = new Map<string, Leg>();
  for (const l of c) if (ok(l)) { const b = best.get(l.fixtureId); if (!b || score(l) > score(b)) best.set(l.fixtureId, l); }
  return [...best.values()].sort((a, b) => score(b) - score(a));
}
// Top n legs per match (different markets), so the search can trade an Under for a 1X2 on the same match.
function perMatchTop(c: Leg[], ok: (l: Leg) => boolean, score: (l: Leg) => number, n = 2) {
  const by = new Map<string, Leg[]>();
  for (const l of c) if (ok(l)) by.set(l.fixtureId, [...(by.get(l.fixtureId) ?? []), l]);
  return [...by.values()].flatMap(ls => ls.sort((a, b) => score(b) - score(a)).slice(0, n)).sort((a, b) => score(b) - score(a));
}
// Exhaustive search over small pools: best combination by probability within an odds window.
// Variety first; if no varied combination fits the odds window, the best unconstrained one.
function bestCombo(pool: Leg[], sizes: number[], minOdds: number, maxOdds: number, score: (legs: Leg[]) => number): Leg[] | null {
  return combo(pool, sizes, minOdds, maxOdds, score, true) ?? combo(pool, sizes, minOdds, maxOdds, score, false);
}
function combo(pool: Leg[], sizes: number[], minOdds: number, maxOdds: number, score: (legs: Leg[]) => number, vary: boolean) {
  let best: Leg[] | null = null, bestScore = -Infinity;
  const visit = (start: number, legs: Leg[], odds: number) => {
    if (odds > maxOdds || (vary && legs.filter(isLine).length > lineCap(Math.max(...sizes)))) return;
    if (sizes.includes(legs.length) && odds >= minOdds && (!vary || varied(legs))) { const s = score(legs); if (s > bestScore) { bestScore = s; best = [...legs]; } }
    if (legs.length >= Math.max(...sizes)) return;
    for (let i = start; i < pool.length; i++) if (!legs.some(l => l.fixtureId === pool[i].fixtureId)) visit(i + 1, [...legs, pool[i]], odds * pool[i].odds);
  };
  visit(0, [], 1);
  return best as Leg[] | null;
}
const prob = (legs: Leg[]) => legs.reduce((s, l) => s * l.p, 1);
const ev = (legs: Leg[]) => prob(legs) * legs.reduce((s, l) => s * l.odds, 1);

export function buildTickets(matches: MatchRow[], now = Date.now()) {
  const c = candidates(matches, now);
  // 1. Raddoppi con la singola: una partita a quota 1,70–2,50 dove la quota giocabile ha valore (≥ +2%),
  // ordinate per probabilità: prima le più probabili tra quelle che pagano più del dovuto.
  const singles = perMatch(c, l => l.odds >= 1.7 && l.odds <= 2.5 && l.p >= 0.45 && l.edge >= 0.02, l => l.p + l.edge * 0.25).slice(0, 6)
    .map(l => ticket('raddoppio-singola', 'Raddoppio · singola di valore', 'Una sola partita a quota circa 2 dove la quota paga più della probabilità: se vince raddoppi la puntata.', [l]));
  const tickets: Ticket[] = [];
  // 2. Raddoppio in multipla: 2–3 esiti molto probabili, quota totale 1,90–2,30, massima probabilità.
  const safe = perMatchTop(c, l => l.p >= 0.68 && l.odds >= 1.15 && l.odds <= 1.65, l => l.p, 3).slice(0, 40);
  const r = bestCombo(safe, [2, 3], 1.9, 2.3, prob);
  if (r) tickets.push(ticket('raddoppio-multipla', 'Raddoppio · multipla', '2–3 esiti ad alta probabilità che insieme fanno circa quota 2.', r));
  // 3. Multipla prudente: 3–4 esiti, quota 2,5–4.
  const prudent = bestCombo(safe, [3, 4], 2.5, 4, prob);
  if (prudent) tickets.push(ticket('prudente', 'Multipla prudente', 'Quota media, gli esiti più solidi del turno.', prudent));
  // 4. Multipla di valore: solo esiti con valore positivo, 3–4 eventi, massimo valore atteso.
  const value = perMatch(c, l => l.edge > 0.01 && l.odds >= 1.4 && l.odds <= 3.2, l => l.edge).slice(0, 14);
  const v = bestCombo(value, [3, 4], 3, 20, ev);
  if (v) tickets.push(ticket('valore', 'Multipla di valore', 'Solo esiti dove la quota paga più della probabilità stimata.', v));
  // 5. Multiple a quota 10: 3 e 5 eventi, quota totale 9,5–13,5. Tra le combinazioni in quella fascia sceglie
  // la più probabile, con un piccolo premio al valore. Più esiti candidati per partita, ma mai due della stessa partita.
  const score = (l: Leg) => l.p * (1 + Math.max(0, l.edge) * 2);
  // 3 eventi: servono quote intorno a 2,1–2,4 per esito; 5 eventi: intorno a 1,5–1,7.
  const q10pools: Record<number, Leg[]> = {
    3: c.filter(l => l.p >= 0.35 && l.odds >= 1.9 && l.odds <= 3.6 && l.edge > -0.03).sort((a, b) => score(b) - score(a)).slice(0, 26),
    5: c.filter(l => l.p >= 0.45 && l.odds >= 1.35 && l.odds <= 2.6 && l.edge > -0.03).sort((a, b) => score(b) - score(a)).slice(0, 26),
  };
  for (const k of [3, 5]) {
    const q = bestCombo(q10pools[k], [k], 9.5, 13.5, legs => Math.log(prob(legs)) + 0.5 * Math.log(ev(legs)));
    if (q) tickets.push(ticket('quota10-' + k, 'Multipla quota 10 · ' + k + ' eventi', k + ' esiti scelti per arrivare a quota 10–13 con la probabilità più alta possibile: un buon premio senza esagerare.', q));
  }
  // 6. La multipla più probabile: per 3, 4 e 5 eventi, gli esiti con la probabilità più alta (uno per partita).
  // Il prodotto delle probabilità è massimo prendendo i k esiti più probabili su partite diverse. Quota minima 1,10 per esito.
  const surest = c.filter(l => l.odds >= 1.1 && l.p >= 0.6).sort((a, b) => b.p - a.p);
  const pickVaried = (k: number) => {
    const legs: Leg[] = [];
    for (const l of surest) {
      if (legs.length >= k) break;
      if (legs.some(x => x.fixtureId === l.fixtureId) || (isLine(l) && legs.filter(isLine).length >= lineCap(k))) continue;
      legs.push(l);
    }
    if (legs.length === k) return legs;
    const plain = perMatch(surest, () => true, l => l.p).slice(0, k);
    return plain.length === k ? plain : null;
  };
  const probable = [3, 4, 5].map(k => [k, pickVaried(k)] as const).filter(([, legs]) => legs).map(([k, legs]) => ticket('probabile-' + k, 'Multipla più probabile · ' + k + ' eventi', 'Gli ' + k + ' esiti con la probabilità misurata più alta della settimana, su partite diverse, con mercati vari (non solo Over/Under).', legs!));
  // 7. Bomba della settimana: 5–8 eventi su tutta la settimana, quota 50–200.
  // Solo esiti con probabilità ≥ 45% e mai contro il mercato: preferiti quelli con valore positivo.
  const bombPool = perMatchTop(c, l => l.p >= 0.45 && l.odds >= 1.55 && l.odds <= 3.6 && l.edge > -0.03, l => l.p * (1 + Math.max(0, l.edge) * 2)).slice(0, 22);
  const b = bestCombo(bombPool, [5, 6, 7, 8], 50, 200, legs => Math.log(prob(legs)) + 0.5 * Math.log(ev(legs)));
  const bomb = b ? ticket('bomba', 'Bomba della settimana', 'Quota altissima per sbancare: 5–8 esiti scelti tra le partite della settimana con la probabilità più alta per quella quota. Vince di rado: punta solo una piccola cifra.', b) : null;
  return { singles, tickets, bomb, probable, candidates: c.length };
}
