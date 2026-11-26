// Coverage ("copertura") of a ticket: a second bet on the opposite of the riskiest leg, sized so that if that leg
// fails the cover gives back the money of the main ticket. It cuts the chance of losing everything; it does NOT
// add value: every cover pays the bookmaker's margin a second time, so the expected result goes down a little.

export type CoverLeg = { fixtureId: string; fixture: string; market: string; label: string; p: number; odds: number };
export type CoverOpt = { fixtureId: string; market: string; label: string; p: number; odds: number; bookmaker?: string };

// Exact opposites: the two bets together cover every result of that match.
export function opposite(market: string): string | null {
  const m: Record<string, string> = { home: 'drawAway', away: 'homeDraw', draw: 'homeAway', homeDraw: 'away', drawAway: 'home', homeAway: 'draw', btts: 'noGoal', noGoal: 'btts' };
  if (m[market]) return m[market];
  const ou = /^(over|under)(\d+)$/.exec(market);
  return ou ? (ou[1] === 'over' ? 'under' : 'over') + ou[2] : null;
}

const half = (cents: number) => Math.ceil(cents / 50) * 50; // stakes in steps of 0,50 €

export type CoverPlan = {
  none: { pWin: number; pLoseAll: number; ev: number; win: number };
  cover: null | { leg: CoverLeg; opt: CoverOpt; stake: number; pLoseAll: number; ev: number; ifAllWin: number; ifLegFails: number; ifOtherFails: number; pointless: boolean };
  partial: null | { stake: number; pLoseAll: number; ev: number; ifAllWin: number; ifLegFails: number };
  reason?: string;
};

// stake and results in cents. find(fixtureId, market) returns the cover outcome with its probability and price.
export function coverPlan(legs: CoverLeg[], stake: number, find: (fixtureId: string, market: string) => CoverOpt | null): CoverPlan {
  const O = legs.reduce((s, l) => s * l.odds, 1), P = legs.reduce((s, l) => s * l.p, 1);
  const none = { pWin: P, pLoseAll: 1 - P, ev: Math.round(stake * (P * O - 1)), win: Math.round(stake * O) };
  if (!legs.length || stake <= 0) return { none, cover: null, partial: null, reason: 'Aggiungi almeno un evento e la puntata.' };
  // Riskiest leg that has an exact opposite on the board.
  const cands = legs.map(l => { const k = opposite(l.market); const o = k ? find(l.fixtureId, k) : null; return o && o.odds > 1 ? { l, o } : null; }).filter(Boolean) as { l: CoverLeg; o: CoverOpt }[];
  if (!cands.length) return { none, cover: null, partial: null, reason: 'Nessun evento della schedina ha un esito opposto quotato (combo, multigol e marcatori non si coprono con una sola giocata). Per ridurre il rischio usa un sistema nel Laboratorio.' };
  const { l, o } = cands.sort((a, b) => a.l.p - b.l.p)[0];
  const pj = l.p, rest = P / pj;
  const build = (c: number) => {
    const ifAllWin = Math.round(stake * O) - stake - c, ifLegFails = Math.round(c * o.odds) - c - stake, ifOtherFails = -stake - c;
    const ev = none.ev + Math.round(c * (o.p * o.odds - 1));
    return { stake: c, ifAllWin, ifLegFails, ifOtherFails, pLoseAll: pj * (1 - rest), ev };
  };
  const full = build(half(stake / (o.odds - 1)));
  const part = build(half(stake / (o.odds - 1) / 2));
  return { none, cover: { leg: l, opt: o, ...full, pointless: full.ifAllWin <= 0 }, partial: { stake: part.stake, pLoseAll: part.pLoseAll, ev: part.ev, ifAllWin: part.ifAllWin, ifLegFails: part.ifLegFails } };
}

// ---- Cover with a separate ticket (the way Emiliano played PSG–Roma X2 next to his multiple) ----
// A second, independent ticket on other matches: very probable outcomes or outcomes with value, single or double,
// staked so that if it wins it gives back the money of BOTH tickets. Losing everything then needs both to fail:
// P(lose all) = P(main fails) × P(cover fails). With a cover that has value the expected result even goes up.
export type CoverCand = CoverOpt & { fixture: string; kickoff: string; competition?: string; tag?: string };
export type CoverTicket = { legs: CoverCand[]; p: number; odds: number; stake: number; pLoseAll: number; ev: number; value: number;
  bothWin: number; mainOnly: number; coverOnly: number; bothLose: number; kind: 'sicura' | 'valore' | 'economica' | 'valore-sicura' | 'alternativa' };

export function coverTickets(main: CoverLeg[], stake: number, cands: CoverCand[], maxRatio = 4): { none: CoverPlan['none']; options: CoverTicket[]; target: number } {
  const O = main.reduce((s, l) => s * l.odds, 1), Pm = main.reduce((s, l) => s * l.p, 1);
  const none = { pWin: Pm, pLoseAll: 1 - Pm, ev: Math.round(stake * (Pm * O - 1)), win: Math.round(stake * O) };
  const used = new Set(main.map(l => l.fixtureId));
  const pool = cands.filter(c => !used.has(c.fixtureId) && c.odds > 1.05 && c.p > 0 && c.p < 1)
    .sort((a, b) => b.p - a.p).filter((c, i, a) => a.findIndex(x => x.fixtureId === c.fixtureId) === i).slice(0, 14);
  const tickets: CoverCand[][] = pool.map(c => [c]);
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) if (pool[i].odds * pool[j].odds <= 3.2) tickets.push([pool[i], pool[j]]);
  const out: Omit<CoverTicket, 'kind'>[] = [];
  for (const legs of tickets) {
    const p = legs.reduce((s, l) => s * l.p, 1), odds = legs.reduce((s, l) => s * l.odds, 1);
    if (odds < 1.2) continue;
    const c = half((stake / (odds - 1)) * 1.0001); if (c > stake * maxRatio) continue;
    const win = Math.round(stake * O), back = Math.round(c * odds);
    out.push({ legs, p, odds, stake: c, pLoseAll: (1 - Pm) * (1 - p), ev: none.ev + Math.round(c * (p * odds - 1)), value: p * odds - 1,
      bothWin: win + back - stake - c, mainOnly: win - stake - c, coverOnly: back - stake - c, bothLose: -stake - c });
  }
  if (!out.length) return { none, options: [], target: 0.3 };
  // Three different proposals: the one with the most value, the safest, and the cheapest that still cuts the risk a lot.
  const keyOf = (x: { legs: CoverCand[] }) => x.legs.map(l => l.fixtureId + l.market).join();
  const seen = new Set<string>(), options: CoverTicket[] = [];
  const pick = (k: CoverTicket['kind'], f: (a: Omit<CoverTicket, 'kind'>, b: Omit<CoverTicket, 'kind'>) => number, ok: (x: Omit<CoverTicket, 'kind'>) => boolean = () => true) => {
    const x = out.filter(y => !seen.has(keyOf(y)) && ok(y)).sort(f)[0]; if (x) { seen.add(keyOf(x)); options.push({ ...x, kind: k }); } };
  pick('valore', (a, b) => b.value - a.value || a.pLoseAll - b.pLoseAll, x => x.value >= 0.03);
  pick('sicura', (a, b) => a.pLoseAll - b.pLoseAll || a.stake - b.stake);
  // If the value proposal is already the safest, the second one is just another safe alternative.
  if (options.length > 1 && options[0].kind === 'valore' && options[0].pLoseAll <= options[1].pLoseAll) { options[0] = { ...options[0], kind: 'valore-sicura' }; options[1] = { ...options[1], kind: 'alternativa' }; }
  pick('economica', (a, b) => a.stake - b.stake || a.pLoseAll - b.pLoseAll, x => x.pLoseAll <= (1 - Pm) * 0.65 && x.value > -0.05);
  return { none, options, target: 0.3 };
}
