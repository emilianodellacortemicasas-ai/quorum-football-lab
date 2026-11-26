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
