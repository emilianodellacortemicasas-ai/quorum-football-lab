// Pure logic of the value scanner: fixture/odds reconciliation, market consensus and value selection.
// No I/O here, so every rule is unit-tested.

export const SCANNER_VERSION = 'scanner-v1 · poisson-v0.1 + consenso mercato';
// Model weight in the blended probability. The model is not validated yet, so the market dominates.
export const MODEL_WEIGHT = 0.35;
export const MIN_EDGE = 0.03;
export const MAX_ODDS = 4.5;
export const MIN_BOOKS = 5;
// The best price must be within 6% of the median price: isolated outliers are usually stale or errors.
export const OUTLIER_RATIO = 1.06;
// A model far from the market is far more often wrong than right: such outcomes are never proposed.
// Allowed gap: 6 points, or 25% of the market probability when that is larger.
export const maxDisagreement = (pMarket: number) => Math.max(0.06, 0.25 * pMarket);
export const KELLY_FRACTION = 0.25;
export const KELLY_CAP = 0.02;

// The Odds API keys for the active perimeter (competition ids as in lib/demo.ts).
export const ODDS_SPORT: Record<string, string> = {
  'Serie A': 'soccer_italy_serie_a', 'Premier League': 'soccer_epl', 'La Liga': 'soccer_spain_la_liga',
  'Bundesliga': 'soccer_germany_bundesliga', 'Ligue 1': 'soccer_france_ligue_one', 'Coppa Italia': 'soccer_italy_coppa_italia',
};

const STOP = new Set(['fc','cf','ac','as','ss','sc','afc','us','ssc','club','calcio','de','del','la','le','the','and','sv','vfb','vfl','tsg','fsv','bc','rc','ca','cd','ud','sd','rcd','ogc','losc','stade','1','04','05','1899','1907','1909','1913','hellas']);
const ALIAS: Record<string, string> = { munchen: 'bayern', munich: 'bayern', wolves: 'wolverhampton', spurs: 'tottenham', psg: 'paris', internazionale: 'inter', gladbach: 'monchengladbach', koln: 'cologne', nuernberg: 'nurnberg' };
export const normalizeTeam = (name: string) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(t => t && !STOP.has(t)).map(t => ALIAS[t] || t);
export function sameTeam(a: string, b: string) {
  const x = normalizeTeam(a), y = normalizeTeam(b);
  if (!x.length || !y.length) return false;
  if (x.join(' ') === y.join(' ')) return true;
  return x.some(p => y.some(q => p === q || (p.length >= 4 && q.length >= 4 && (p.startsWith(q) || q.startsWith(p) || (p.length >= 5 && q.length >= 5 && p.slice(0, 5) === q.slice(0, 5))))));
}

export type OddsEvent = { id: string; home_team: string; away_team: string; commence_time: string; bookmakers?: any[] };
export type Fixture = { id: string; home: string; away: string; kickoff: string; competition: string };

// Both teams must match within 3 hours. A single-team match is accepted only when it is the unique
// event starting within 15 minutes, which covers unusual club names without mixing up fixtures.
export function matchEvent(f: Fixture, events: OddsEvent[]): OddsEvent | null {
  const t = Date.parse(f.kickoff);
  const near = events.map(e => ({ e, dt: Math.abs(Date.parse(e.commence_time) - t) })).filter(x => Number.isFinite(x.dt) && x.dt <= 3 * 3600000);
  const both = near.filter(x => sameTeam(f.home, x.e.home_team) && sameTeam(f.away, x.e.away_team)).sort((a, b) => a.dt - b.dt);
  if (both.length) return both[0].e;
  const close = near.filter(x => x.dt <= 15 * 60000);
  const one = close.filter(x => sameTeam(f.home, x.e.home_team) || sameTeam(f.away, x.e.away_team));
  return one.length === 1 && close.length === 1 ? one[0].e : null;
}

export type Quote = { key: string; price: number; bookmaker: string; pFair: number };
// Per bookmaker: remove the margin inside each market (1X2, or each Over/Under line), then average across books.
export function marketConsensus(event: OddsEvent) {
  const quotes: Quote[] = [];
  for (const b of event.bookmakers || []) {
    if (typeof b?.title !== 'string') continue;
    for (const m of b.markets || []) {
      const groups = new Map<string, { key: string; price: number }[]>();
      for (const o of m.outcomes || []) {
        if (!Number.isFinite(o?.price) || o.price <= 1 || o.price > 1000) continue;
        let key: string | null = null, group = m.key;
        if (m.key === 'h2h') key = o.name === event.home_team ? 'home' : o.name === event.away_team ? 'away' : o.name === 'Draw' ? 'draw' : null;
        if (['totals_corners', 'totals_cards', 'alternate_totals_corners', 'alternate_totals_cards'].includes(m.key) && Number.isFinite(o.point) && o.point > 0 && o.point < 30 && (o.name === 'Over' || o.name === 'Under')) {
          key = (m.key.includes('corners') ? 'corners' : 'cards') + ':total:' + (o.name === 'Over' ? 'over' : 'under') + ':' + o.point; group = m.key.replace('alternate_', '') + o.point;
        }
        if (m.key === 'btts') key = o.name === 'Yes' ? 'btts' : o.name === 'No' ? 'noGoal' : null;
        if (m.key === 'totals' && [1.5, 2.5, 3.5].includes(o.point) && (o.name === 'Over' || o.name === 'Under')) {
          const line = String(o.point).replace('.', ''); key = (o.name === 'Over' ? 'over' : 'under') + line; group = 'totals' + line;
        }
        if (!key) continue;
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group)!.push({ key, price: o.price });
      }
      // Anytime goalscorer: one-sided market, margin removed with a flat 10% overround.
      if (m.key === 'player_goal_scorer_anytime') {
        for (const o of m.outcomes || []) if (o?.name === 'Yes' && typeof o.description === 'string' && Number.isFinite(o.price) && o.price > 1 && o.price < 200)
          quotes.push({ key: 'anytime:' + normalizeTeam(o.description).join(' '), price: o.price, bookmaker: b.title, pFair: Math.min(0.95, 1 / o.price / 1.1) });
        continue;
      }
      for (const [group, list] of groups) {
        const needed = group === 'h2h' ? 3 : 2;
        if (list.length !== needed || new Set(list.map(x => x.key)).size !== needed) continue;
        const inv = list.map(x => 1 / x.price), sum = inv.reduce((a, c) => a + c, 0);
        if (sum < 0.98 || sum > 1.25) continue; // implausible book: skip it entirely
        list.forEach((x, i) => quotes.push({ key: x.key, price: x.price, bookmaker: b.title, pFair: inv[i] / sum }));
      }
    }
  }
  const out: Record<string, { pMarket: number; bestOdds: number; bookmaker: string; books: number }> = {};
  for (const key of new Set(quotes.map(q => q.key))) {
    const rows = quotes.filter(q => q.key === key), prices = rows.map(r => r.price).sort((a, b) => a - b);
    const median = prices.length % 2 ? prices[(prices.length - 1) / 2] : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2;
    const best = rows.filter(r => r.price <= median * OUTLIER_RATIO).reduce((a, c) => c.price > a.price ? c : a);
    out[key] = { pMarket: rows.reduce((s, r) => s + r.pFair, 0) / rows.length, bestOdds: best.price, bookmaker: best.bookmaker, books: rows.length };
  }
  return out;
}

export const SCANNED_MARKETS = ['home', 'draw', 'away', 'over15', 'under15', 'over25', 'under25', 'over35', 'under35', 'btts', 'noGoal'] as const;

// adjust: optional measured calibration of the final probability (from settled results).
export function evaluateOutcome(pModel: number, m: { pMarket: number; bestOdds: number; books: number }, adjust?: (p: number) => number) {
  const raw = MODEL_WEIGHT * pModel + (1 - MODEL_WEIGHT) * m.pMarket, pBlend = adjust ? adjust(raw) : raw;
  const edge = pBlend * m.bestOdds - 1;
  const fullKelly = edge > 0 ? edge / (m.bestOdds - 1) : 0;
  const kelly = Math.min(KELLY_CAP, fullKelly * KELLY_FRACTION);
  const reasons: string[] = [];
  if (edge < MIN_EDGE) reasons.push('valore insufficiente');
  if (m.bestOdds > MAX_ODDS) reasons.push('quota troppo alta');
  if (m.books < MIN_BOOKS) reasons.push('pochi bookmaker');
  if (Math.abs(pModel - m.pMarket) > maxDisagreement(m.pMarket)) reasons.push('modello troppo lontano dal mercato');
  return { pBlend, edge, kelly, isPick: reasons.length === 0, reasons };
}
