import { htRange, partTest } from './exact.ts';
// Settlement rules: final facts of a match → result of a market. Pure.
export type Final = { hg: number; ag: number; corners: [number, number] | null; yellow: [number, number] | null; red: [number, number] | null; penAwarded: [number, number] | null; penMissed: [number, number] | null; scorers: number[] | null; ht?: [number, number] | null };
export type Outcome = 'won' | 'lost' | 'void' | null;
const ou = (v: number, dir: string, line: number): Outcome => v === line ? 'void' : (dir === 'over' ? v > line : v < line) ? 'won' : 'lost';
const b = (x: boolean): Outcome => x ? 'won' : 'lost';
export function outcome(market: string, f: Final): Outcome {
  const { hg, ag } = f, t = hg + ag;
  switch (market) {
    case 'home': return b(hg > ag); case 'draw': return b(hg === ag); case 'away': return b(hg < ag);
    case 'homeDraw': return b(hg >= ag); case 'drawAway': return b(hg <= ag); case 'homeAway': return b(hg !== ag);
    case 'btts': return b(hg > 0 && ag > 0); case 'noGoal': return b(hg === 0 || ag === 0);
  }
  let m = /^(over|under)(\d)(\d)$/.exec(market);
  if (m) return ou(t, m[1], Number(m[2] + '.' + m[3]));
  m = /^exact:(\d+)-(\d+)$/.exec(market);
  if (m) return b(hg === Number(m[1]) && ag === Number(m[2]));
  m = /^(teamGoals|corners|yellow|red|cards):(total|home|away):(over|under):(\d+(?:\.\d+)?)$/.exec(market);
  if (m) {
    const pair: [number, number] | null = m[1] === 'teamGoals' ? [hg, ag] : m[1] === 'cards' ? (f.yellow && f.red ? [f.yellow[0] + f.red[0], f.yellow[1] + f.red[1]] : null) : (f as any)[m[1]];
    if (!pair) return null;
    const v = m[2] === 'total' ? pair[0] + pair[1] : pair[m[2] === 'home' ? 0 : 1];
    return ou(v, m[3], Number(m[4]));
  }
  if (market === 'pen:awarded:yes' || market === 'pen:awarded:no') return f.penAwarded ? b((f.penAwarded[0] + f.penAwarded[1] > 0) === market.endsWith('yes')) : null;
  if (market === 'pen:missed:yes' || market === 'pen:missed:no') return f.penMissed ? b((f.penMissed[0] + f.penMissed[1] > 0) === market.endsWith('yes')) : null;
  // Combo (result + goals), multigol and exact score markets, e.g. 'combo:1X + Under 3,5', 'multigol:1-3'.
  // Custom combos may contain scorers: 'combo:1X + Over 1,5 + scorer=12345'.
  if (market.startsWith('combo:')) {
    let all = true;
    for (const part of market.slice(6).split(' + ')) {
      const sm = /^scorer=(\d+)$/.exec(part);
      if (sm) { if (!f.scorers) return null; all = all && f.scorers.includes(Number(sm[1])); continue; }
      const h = htRange(part);
      if (h) { if (!f.ht) return null; const g = f.ht[0] + f.ht[1]; all = all && g >= h[0] && g <= h[1]; continue; }
      const t = partTest(part); if (!t) return null;
      all = all && t({ home: hg, away: ag });
    }
    return b(all);
  }
  m = /^multigol:(\d+)-(\d+)$/.exec(market);
  if (m) return b(t >= Number(m[1]) && t <= Number(m[2]));
  m = /^scorer:(\d+)$/.exec(market);
  if (m) return f.scorers ? b(f.scorers.includes(Number(m[1]))) : null;
  return null;
}
// Ticket: lost if any leg lost; won when every leg is won or void (void legs count at odds 1).
export function ticketOutcome(legs: Outcome[]): Outcome {
  if (legs.includes('lost')) return 'lost';
  if (legs.some(l => l === null)) return null;
  return legs.every(l => l === 'void') ? 'void' : 'won';
}
