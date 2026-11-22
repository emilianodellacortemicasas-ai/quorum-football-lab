// Automatic tickets (singles that double the stake and accumulators) built from the latest predictions.
// Pure logic: input = per-match markets with blended probability and best price.
import { familyOf, ticketReliability } from './calibration.ts';
import { className, evaluateClasses } from './math.ts';
const LABELS: Record<string, string> = { home: '1 · Casa', draw: 'X · Pareggio', away: '2 · Ospite', over15: 'Over 1,5', under15: 'Under 1,5', over25: 'Over 2,5', under25: 'Under 2,5', over35: 'Over 3,5', under35: 'Under 3,5', btts: 'Goal', noGoal: 'No Goal', homeDraw: '1X · Doppia chance', drawAway: 'X2 · Doppia chance', homeAway: '12 · Doppia chance' };

export type Leg = { fixtureId: string; fixture: string; competition: string; kickoff: string; market: string; label: string; p: number; odds: number; bookmaker: string; edge: number; se: number; italian: boolean };
export type SystemTicket = { kind: string; title: string; day: string; legs: Leg[]; classes: { k: number; unitCents: number }[]; name: string; tickets: number; costCents: number; pWin: number; pProfit: number; expectedCents: number; minWinCents: number; maxReturnCents: number; breakEven: number | null; byWinners: { winners: number; p: number; minReturnCents: number; maxReturnCents: number }[]; worstLossCents: number };
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
      // An Italian price far above every European price is almost always an old quote: ignored.
      const it0 = x.it && Object.keys(x.it).length ? Object.entries<number>(x.it).sort((a, b) => b[1] - a[1]) : null;
      const it = it0 && !(Number.isFinite(x.bestOdds) && it0[0][1] > x.bestOdds * 1.04) ? it0 : null;
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
const ROME_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' });
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
  // 8. Tre raddoppi sicuri, filosofia dei tipster: 2 (massimo 3) eventi molto probabili, quota totale ~2,00,
  // solo quote italiane, partite nei prossimi 4 giorni, niente squadre con assenze pesanti, partite diverse tra i tre.
  const meta = new Map(matches.map(m => [m.fixture_id, m.markets?.meta]));
  const heavyAbsence = (id: string) => { const a = meta.get(id)?.adjust; return !!a && (a.home?.factor < 0.85 || a.away?.factor < 0.85); };
  const surePool = perMatchTop(c, l => l.italian && l.p >= 0.64 && l.odds >= 1.2 && l.odds <= 1.75 && familyOf(l.market) !== null
    && Date.parse(l.kickoff) - now <= 96 * 3600000 && !heavyAbsence(l.fixtureId), l => l.p, 3).slice(0, 48);
  const sure: Ticket[] = [], used = new Set<string>();
  for (let i = 0; i < 4; i++) {
    const pool = surePool.filter(l => !used.has(l.fixtureId));
    const t = bestCombo(pool, [2], 1.85, 2.3, legs => Math.log(prob(legs)));
    if (!t) break;
    t.forEach(l => used.add(l.fixtureId));
    sure.push(ticket('raddoppio-sicuro-' + (i + 1), 'Raddoppio #' + (i + 1), 'Due squadre, quota circa 2: i due esiti più affidabili che insieme raddoppiano la puntata. Quote Lottomatica / Planetwin365, partite entro 4 giorni, nessuna assenza pesante.', t));
  }
  // 9. Schedine da 3 e 5 squadre per fascia di probabilità del singolo esito (80–90%, 70–80%, 60–70%):
  // dentro la fascia QUORUM sceglie gli esiti con più valore, su partite e mercati diversi.
  const soon = (l: Leg) => Date.parse(l.kickoff) - now <= 96 * 3600000;
  const bands: [number, number, string][] = [[0.8, 0.9, '80–90%'], [0.7, 0.8, '70–80%'], [0.6, 0.7, '60–70%']];
  const banded: Ticket[] = [];
  for (const [lo, hi, name] of bands) {
    const pool = c.filter(l => l.italian && l.p >= lo && l.p < hi && l.odds >= 1.1 && l.edge > -0.05 && familyOf(l.market) !== null && soon(l) && !heavyAbsence(l.fixtureId))
      .sort((a, b) => (b.edge + 0.3 * b.p) - (a.edge + 0.3 * a.p));
    for (const size of [3, 5]) {
      const legs: Leg[] = [];
      for (const l of pool) {
        if (legs.length >= size) break;
        if (legs.some(x => x.fixtureId === l.fixtureId) || (isLine(l) && legs.filter(isLine).length >= lineCap(size))) continue;
        legs.push(l);
      }
      if (legs.length === size) banded.push(ticket('fascia-' + size + '-' + Math.round(lo * 100), size + ' squadre · esiti al ' + name, size + ' esiti ognuno con probabilità ' + name + ', scelti tra quelli con più valore sulle quote italiane.', legs));
    }
  }
  // 10. Giornate di partite (ora di Roma): per ognuna un sistema pronto e una bomba.
  const dayMemo = new Map<string, string>(), romeDay = (iso: string) => { let d = dayMemo.get(iso); if (!d) { d = ROME_FMT.format(new Date(iso)); dayMemo.set(iso, d); } return d; };
  const days = [...new Set(c.filter(soon).map(l => romeDay(l.kickoff)))].sort().slice(0, 4);
  const dayLabel = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  const systems: SystemTicket[] = [], bombs: Ticket[] = [];
  for (const d of days) {
    const today = c.filter(l => romeDay(l.kickoff) === d && l.italian && familyOf(l.market) !== null && !heavyAbsence(l.fixtureId));
    const matchesToday = new Set(today.map(l => l.fixtureId)).size;
    // Sistema del giorno: 4–5 esiti a quota 1,55–2,40 con buona probabilità; struttura scelta per la probabilità di profitto.
    const sysLegs = perMatch(today, l => l.p >= 0.55 && l.odds >= 1.55 && l.odds <= 2.4 && l.edge > -0.05, l => l.p * (1 + Math.max(0, l.edge) * 2)).slice(0, matchesToday >= 6 ? 5 : 4);
    if (sysLegs.length >= 4) {
      const n = sysLegs.length, sel = sysLegs.map(l => ({ fixtureId: l.fixtureId, fixture: l.fixture, market: l.market, label: l.label, p: l.p, odds: l.odds }));
      const shapes: number[][] = n === 5 ? [[3], [4], [3, 4], [3, 4, 5], [2, 3]] : [[3], [3, 4], [2, 3], [2, 3, 4]];
      let best: { classes: { k: number; unitCents: number }[]; r: ReturnType<typeof evaluateClasses> } | null = null;
      for (const sh of shapes) {
        const classes = sh.map(k => ({ k, unitCents: 100 })), r = evaluateClasses(sel, classes);
        const score = r.pProfit + Math.min(0, r.expectedCents / r.costCents) * 0.5;
        if (!best || score > best.r.pProfit + Math.min(0, best.r.expectedCents / best.r.costCents) * 0.5) best = { classes, r };
      }
      if (best) systems.push({ kind: 'sistema-' + d, title: 'Sistema di ' + dayLabel(d), day: d, legs: [...sysLegs].sort((a, b) => a.kickoff.localeCompare(b.kickoff)), classes: best.classes, name: 'Sistema ' + n + ' eventi · ' + best.classes.map(x => className(x.k, n)).join(' + '), ...best.r });
    }
    // Bomba del giorno: quota adatta al numero di partite (giornata piena 40–100, altrimenti 10–30).
    const big = matchesToday >= 8, [minQ, maxQ] = big ? [40, 100] : [10, 30], sizes = big ? [5, 6, 7, 8] : [3, 4, 5, 6];
    const bp = perMatchTop(today, l => l.p >= 0.42 && l.odds >= 1.55 && l.odds <= 3.8 && l.edge > -0.04, l => l.p * (1 + Math.max(0, l.edge) * 2)).slice(0, 20);
    const bt = bestCombo(bp, sizes, minQ, maxQ, legs => Math.log(prob(legs)) + 0.5 * Math.log(ev(legs)));
    if (bt) bombs.push(ticket('bomba-' + d, 'Bomba di ' + dayLabel(d), 'La giocata da sogno della giornata: ' + bt.length + ' esiti, quota ' + Math.round(bt.reduce((q, l) => q * l.odds, 1)) + '. Vince di rado: puntata minima.', bt));
  }
  // 11. Multiple pronte per ogni giornata: 3 eventi (quota 2,8–5) e 5 eventi (quota 6–12), la più probabile
  // nella fascia di quota con un premio al valore.
  const multiples: Ticket[] = [];
  for (const d of days) {
    const pool = perMatchTop(c.filter(l => romeDay(l.kickoff) === d && l.italian && familyOf(l.market) !== null && !heavyAbsence(l.fixtureId)), l => l.p >= 0.5 && l.odds >= 1.3 && l.odds <= 2.6 && l.edge > -0.04, l => l.p * (1 + Math.max(0, l.edge) * 2), 2).slice(0, 20);
    for (const [k, lo, hi] of [[3, 2.8, 5], [5, 6, 12]] as const) {
      const t = bestCombo(pool, [k], lo, hi, legs => Math.log(prob(legs)) + 0.5 * Math.log(ev(legs)));
      if (t) multiples.push(ticket('multipla-' + d + '-' + k, 'Multipla ' + k + ' eventi · ' + dayLabel(d), k + ' esiti della giornata, quota ' + lo.toString().replace('.', ',') + '–' + hi + ', la combinazione più probabile in questa fascia.', t));
    }
  }
  // 12. Schemi settimanali: sistemi in cui puoi sbagliare una (o due) partite e restare in profitto.
  // 4 su 5 e 5 su 6 = sbagli 1; 5 su 7 = sbagli 2. Struttura scelta per la probabilità di profitto.
  const week = c.filter(l => l.italian && familyOf(l.market) !== null && !heavyAbsence(l.fixtureId) && Date.parse(l.kickoff) - now <= 7 * 86400000);
  const schemes: SystemTicket[] = [];
  const schemeDefs: { kind: string; n: number; k: number; minP: number; lo: number; hi: number }[] = [
    { kind: 'schema-4su5', n: 5, k: 4, minP: 0.64, lo: 1.45, hi: 2.1 }, { kind: 'schema-5su6', n: 6, k: 5, minP: 0.6, lo: 1.45, hi: 2.2 }, { kind: 'schema-5su7', n: 7, k: 5, minP: 0.56, lo: 1.5, hi: 2.4 }];
  const usedS = new Set<string>();
  for (const sd of schemeDefs) {
    const legs = perMatch(week.filter(l => !usedS.has(l.fixtureId)), l => l.p >= sd.minP && l.odds >= sd.lo && l.odds <= sd.hi && l.edge > -0.04, l => l.p * (1 + Math.max(0, l.edge) * 2));
    const pick: Leg[] = [];
    for (const l of legs) { if (pick.length >= sd.n) break; if (isLine(l) && pick.filter(isLine).length >= lineCap(sd.n)) continue; pick.push(l); }
    if (pick.length < sd.n) continue;
    const sel = pick.map(l => ({ fixtureId: l.fixtureId, fixture: l.fixture, market: l.market, label: l.label, p: l.p, odds: l.odds }));
    let best: { classes: { k: number; unitCents: number }[]; r: ReturnType<typeof evaluateClasses> } | null = null;
    for (const sh of [[sd.k], [sd.k, sd.n], ...(sd.k + 1 < sd.n ? [[sd.k, sd.k + 1]] : [])]) {
      const classes = sh.map(k => ({ k, unitCents: 100 })), r = evaluateClasses(sel, classes), sc = r.pProfit + Math.min(0, r.expectedCents / r.costCents) * 0.5;
      if (!best || sc > best.r.pProfit + Math.min(0, best.r.expectedCents / best.r.costCents) * 0.5) best = { classes, r };
    }
    pick.forEach(l => usedS.add(l.fixtureId));
    const errors = sd.n - sd.k;
    schemes.push({ kind: sd.kind, title: 'Schema ' + sd.k + ' su ' + sd.n + ' · puoi sbagliarne ' + errors, day: 'settimana', legs: [...pick].sort((a, b) => a.kickoff.localeCompare(b.kickoff)), classes: best!.classes, name: 'Sistema ' + sd.n + ' eventi · ' + best!.classes.map(x => className(x.k, sd.n)).join(' + '), ...best!.r });
  }
  return { singles, tickets, bomb, probable, sure, banded, systems, bombs, multiples, schemes, candidates: c.length };
}
