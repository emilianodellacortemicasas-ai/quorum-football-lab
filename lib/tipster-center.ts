// Centro Tipster: what a professional bettor checks before and after every bet. Pure logic.
//  1. Performance: yield in units, CLV, wins vs expected, "luck or skill" (confidence interval, t-statistic).
//  2. Where the edge is: yield and CLV by league, market, odds band, bookmaker and how early the bet was placed.
//  3. Line movements: sharp probability (Pinnacle) from the first scan and the previous scan to now, against the
//     Italian price; "steam" = the sharp price is falling while an Italian book still pays the old price.
//  4. Bookmaker margins per league and market (where each Italian book is more generous).
//  5. Streaks and drawdown, compared with what chance alone produces.
//  6. Opportunities with the pre-bet checklist and the stake in units.
import { TIP_MIN_EDGE, tipsterPicks } from './tipster.ts';

export type CenterLeg = { fixtureId: string; competition: string; market: string; label?: string; odds: number; bookmaker?: string; kickoff?: string };
export type CenterRec = { id: string; kind: string; legs: CenterLeg[]; odds: number; p: number; result: 'won' | 'lost' | 'void' | null; createdAt: string; closeP: number | null };
type Row = { fixture_id: string; fixture: string; competition: string; kickoff: string; markets: Record<string, any> };

export const MARKETS: Record<string, string> = { home: '1', draw: 'X', away: '2', homeDraw: '1X', drawAway: 'X2', homeAway: '12', over15: 'Over 1,5', under15: 'Under 1,5', over25: 'Over 2,5', under25: 'Under 2,5', over35: 'Over 3,5', under35: 'Under 3,5', btts: 'Goal', noGoal: 'No Goal' };
export const marketFamily = (m: string) => /^(home|draw|away)$/.test(m) ? 'Esito 1X2' : /^(homeDraw|drawAway|homeAway)$/.test(m) ? 'Doppia chance' : /^(over|under)\d\d$/.test(m) ? 'Under / Over' : /^(btts|noGoal)$/.test(m) ? 'Goal / No Goal' : m.startsWith('combo:') ? 'Combo' : m.startsWith('scorer') ? 'Marcatori' : 'Altri mercati';
export const oddsBand = (o: number) => o < 1.6 ? '1,40–1,59' : o < 1.9 ? '1,60–1,89' : o < 2.3 ? '1,90–2,29' : o < 3 ? '2,30–2,99' : '3,00 e oltre';
const leadBand = (h: number) => h < 6 ? 'meno di 6 ore prima' : h < 24 ? '6–24 ore prima' : h < 72 ? '1–3 giorni prima' : 'più di 3 giorni prima';
const mean = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const sd = (a: number[]) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

// ---- 1. Performance and "luck or skill" ----
export function performance(recs: CenterRec[]) {
  const closed = recs.filter(r => r.result === 'won' || r.result === 'lost');
  const profit = closed.map(r => r.result === 'won' ? r.odds - 1 : -1);
  const clvs = closed.concat(recs.filter(r => r.result === null)).filter(r => r.closeP !== null).map(r => r.closeP! * r.odds - 1);
  const n = closed.length, y = mean(profit), s = sd(profit), half = n > 1 ? 1.96 * s / Math.sqrt(n) : null;
  const c = mean(clvs), cs = sd(clvs), tClv = clvs.length > 1 && cs > 0 ? c / (cs / Math.sqrt(clvs.length)) : null;
  const tProfit = n > 1 && s > 0 ? y / (s / Math.sqrt(n)) : null;
  // Bets still needed so that the CLV is 2 standard errors from zero (if the current average holds).
  const needed = c > 0 && cs > 0 ? Math.max(0, Math.ceil((2 * cs / c) ** 2) - clvs.length) : null;
  const verdict = n + clvs.length === 0 ? 'nessuna' : clvs.length < 20 && n < 30 ? 'presto'
    : tClv !== null && tClv >= 2 ? 'bravura' : half !== null && y - half > 0 ? 'bravura'
    : tClv !== null && tClv <= -2 ? 'svantaggio' : c > 0 ? 'promettente' : 'fortuna';
  return {
    n, won: closed.filter(r => r.result === 'won').length, expected: closed.reduce((a, r) => a + r.p, 0), pending: recs.filter(r => r.result === null).length,
    units: profit.reduce((a, x) => a + x, 0), yield: n ? y : null, ci: half === null ? null : [y - half, y + half] as [number, number], tProfit,
    clv: clvs.length ? c : null, clvN: clvs.length, clvBeat: clvs.length ? clvs.filter(x => x > 0).length / clvs.length : null, tClv, needed, verdict,
    // Cumulative units over time (1 unit per bet), for the chart.
    curve: (() => { let u = 0; return [...closed].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(r => ({ at: r.createdAt, u: (u += r.result === 'won' ? r.odds - 1 : -1) })); })(),
  };
}

// ---- 2. Where the edge is ----
export type Segment = { key: string; n: number; won: number; expected: number; yield: number | null; clv: number | null; clvN: number; flag: 'spingi' | 'taglia' | null };
function segment(recs: CenterRec[], keyOf: (r: CenterRec) => string | null): Segment[] {
  const g = new Map<string, CenterRec[]>();
  for (const r of recs) { const k = keyOf(r); if (k) (g.get(k) ?? g.set(k, []).get(k)!).push(r); }
  return [...g.entries()].map(([key, rs]) => {
    // Pruning, tipster style: a segment is cut only when the evidence is enough to rule out bad luck —
    // at least 30 measured bets with CLV below −1%, or 60 with CLV below zero. Pushed from 20 bets at ≥ +2%.
    const p = performance(rs), flag = p.clv === null ? null : p.clvN >= 20 && p.clv >= 0.02 ? 'spingi' : (p.clvN >= 30 && p.clv < -0.01) || (p.clvN >= 60 && p.clv < 0) ? 'taglia' : null;
    return { key, n: p.n, won: p.won, expected: p.expected, yield: p.yield, clv: p.clv, clvN: p.clvN, flag } as Segment;
  }).sort((a, b) => (b.clvN + b.n) - (a.clvN + a.n));
}
export function segments(recs: CenterRec[]) {
  const singles = recs.filter(r => r.legs.length === 1), one = (r: CenterRec) => r.legs[0];
  return {
    league: segment(singles, r => one(r).competition || null),
    market: segment(singles, r => marketFamily(one(r).market)),
    band: segment(recs, r => oddsBand(r.odds)),
    book: segment(singles, r => one(r).bookmaker?.split(' / ')[0] || null),
    lead: segment(singles, r => { const k = one(r).kickoff; return k ? leadBand((Date.parse(k) - Date.parse(r.createdAt)) / 3600000) : null; }),
    kind: segment(recs, r => r.legs.length === 1 ? 'Singole' : r.legs.length === 2 ? 'Doppie' : 'Multiple'),
  };
}

// ---- 3. Line movements ----
const sharp = (mk: Record<string, any> | undefined, key: string): number | null => {
  if (!mk) return null;
  const pair: Record<string, [string, string]> = { homeDraw: ['home', 'draw'], drawAway: ['draw', 'away'], homeAway: ['home', 'away'] };
  if (pair[key]) { const a = sharp(mk, pair[key][0]), b = sharp(mk, pair[key][1]); return a !== null && b !== null ? a + b : null; }
  const m = mk[key]; if (!m) return null;
  return Number.isFinite(m.pSharp) ? m.pSharp : Number.isFinite(m.pMarket) && (m.books ?? 0) >= 5 ? m.pMarket : null;
};
const itBest = (mk: Record<string, any> | undefined, key: string) => { const it = mk?.[key]?.it as Record<string, number> | undefined; if (!it) return null; const b = Object.entries(it).filter(([k]) => k !== 'Planetwin365').sort((a, c) => c[1] - a[1])[0]; return b ? { book: b[0], odds: b[1] } : null; };
export type Move = { fixtureId: string; fixture: string; competition: string; kickoff: string; market: string; label: string; pOpen: number; pPrev: number | null; pNow: number; dOpen: number; dRecent: number | null; fairNow: number; it: { book: string; odds: number } | null; itOpen: number | null; edge: number | null; kind: 'steam' | 'drift' | 'stabile'; since: string };
export function movements(now: Row[], open: Map<string, { at: string; markets: Record<string, any> }>, prev: Map<string, { at: string; markets: Record<string, any> }>, t = Date.now()) {
  const out: Move[] = [];
  for (const r of now) {
    if (Date.parse(r.kickoff) <= t + 10 * 60000) continue;
    const o = open.get(r.fixture_id), pv = prev.get(r.fixture_id); if (!o) continue;
    for (const key of Object.keys(MARKETS)) {
      const pNow = sharp(r.markets, key), pOpen = sharp(o.markets, key); if (pNow === null || pOpen === null) continue;
      const pPrev = pv ? sharp(pv.markets, key) : null, it = itBest(r.markets, key), itO = itBest(o.markets, key);
      const dOpen = pNow - pOpen, dRecent = pPrev !== null ? pNow - pPrev : null, edge = it ? pNow * it.odds - 1 : null;
      const kind = dOpen >= 0.02 ? 'steam' : dOpen <= -0.02 ? 'drift' : 'stabile';
      if (kind === 'stabile') continue;
      out.push({ fixtureId: r.fixture_id, fixture: r.fixture, competition: r.competition, kickoff: r.kickoff, market: key, label: MARKETS[key], pOpen, pPrev, pNow, dOpen, dRecent, fairNow: 1 / pNow, it, itOpen: itO?.odds ?? null, edge, kind, since: o.at });
    }
  }
  // Steam first (the most useful: the Italian price may still be the old one), biggest moves first.
  const by = (k: string) => out.filter(m => m.kind === k).sort((a, b) => Math.abs(b.dOpen) - Math.abs(a.dOpen));
  return [...by('steam').slice(0, 30), ...by('drift').slice(0, 12)];
}

// ---- 4. Bookmaker margins ----
const SETS: [string, string[]][] = [['1X2', ['home', 'draw', 'away']], ['Under / Over 2,5', ['over25', 'under25']], ['Goal / No Goal', ['btts', 'noGoal']]];
export function margins(rows: Row[]) {
  const acc = new Map<string, { n: number; m: number }>(), books = new Set<string>(), leagues = new Set<string>();
  for (const r of rows) for (const [set, keys] of SETS) {
    const its = keys.map(k => r.markets?.[k]?.it as Record<string, number> | undefined);
    if (its.some(x => !x)) continue;
    for (const b of Object.keys(its[0]!)) {
      if (b === 'Planetwin365' || its.some(x => !(x![b] > 1))) continue;
      const m = its.reduce((s, x) => s + 1 / x![b], 0) - 1; if (m < -0.02 || m > 0.3) continue;
      for (const k of [b + '|' + set + '|' + r.competition, b + '|' + set + '|*']) { const a = acc.get(k) ?? { n: 0, m: 0 }; a.n++; a.m += m; acc.set(k, a); }
      books.add(b); leagues.add(r.competition);
    }
  }
  const get = (b: string, set: string, l: string) => { const a = acc.get(b + '|' + set + '|' + l); return a && a.n >= 2 ? a.m / a.n : null; };
  const table = SETS.map(([set]) => ({ set, rows: [...leagues].sort().map(l => ({ league: l, books: Object.fromEntries([...books].map(b => [b, get(b, set, l)])) })), avg: Object.fromEntries([...books].map(b => [b, get(b, set, '*')])) }));
  return { books: [...books].sort(), table };
}

// ---- 5. Streaks and drawdown vs chance ----
export function streaks(recs: CenterRec[], paths = 2000) {
  const closed = recs.filter(r => r.result === 'won' || r.result === 'lost').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let cur = 0, curWin = 0, worst = 0, bank = 0, peak = 0, dd = 0;
  for (const r of closed) {
    if (r.result === 'lost') { cur++; curWin = 0; worst = Math.max(worst, cur); bank -= 1; } else { cur = 0; curWin++; bank += r.odds - 1; }
    peak = Math.max(peak, bank); dd = Math.max(dd, peak - bank);
  }
  // What chance alone produces with the same probabilities: distribution of the worst losing streak and drawdown.
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const ws: number[] = [], dds: number[] = [];
  for (let k = 0; k < (closed.length ? paths : 0); k++) {
    let c = 0, w = 0, b = 0, pk = 0, d = 0;
    for (const r of closed) { if (rnd() < r.p) { c = 0; b += r.odds - 1; } else { c++; w = Math.max(w, c); b -= 1; } pk = Math.max(pk, b); d = Math.max(d, pk - b); }
    ws.push(w); dds.push(d);
  }
  ws.sort((a, b) => a - b); dds.sort((a, b) => a - b);
  const q = (a: number[], x: number) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * x))] : 0;
  const pWorse = ws.length ? ws.filter(x => x >= worst).length / ws.length : null;
  return { n: closed.length, current: cur ? { type: 'perse', n: cur } : curWin ? { type: 'vinte', n: curWin } : null, worst, drawdown: dd, units: bank,
    expectedWorst: q(ws, 0.5), worst95: q(ws, 0.95), dd95: q(dds, 0.95), pWorse,
    verdict: !closed.length ? 'nessuna' : worst > q(ws, 0.95) || dd > q(dds, 0.95) ? 'anomala' : 'normale' };
}

// ---- 6. Opportunities with the checklist ----
export type CheckItem = { id: string; label: string; ok: boolean | null; note: string };
export type Opportunity = { all: Record<string, number>; fixtureId: string; fixture: string; competition: string; kickoff: string; market: string; label: string; odds: number; bookmaker: string; fair: number; edge: number; pTrue: number; source: string; ageH: number | null; units: number; stakeCents: number; grade: 'A' | 'B' | 'C'; checks: CheckItem[]; move: number | null };
export function opportunities(rows: Row[], moves: Move[], seg: ReturnType<typeof segments> | null, opts: { equityCents: number; capBps: number }, t = Date.now()) {
  const picks = tipsterPicks(rows, t), out: Opportunity[] = [], byKey = new Map(moves.map(m => [m.fixtureId + ':' + m.market, m]));
  const segOf = (list: Segment[] | undefined, k: string) => list?.find(s => s.key === k) ?? null;
  for (const l of picks.singles) {
    const r = rows.find(x => x.fixture_id === l.fixtureId)!, mv = byKey.get(l.fixtureId + ':' + l.market) ?? null;
    const adj = r?.markets?.meta?.adjust, heavy = !!adj && (adj.home?.factor < 0.85 || adj.away?.factor < 0.85);
    const sl = segOf(seg?.league, l.competition), sm = segOf(seg?.market, marketFamily(l.market)), sb = segOf(seg?.band, oddsBand(l.odds)), bad = [sl, sm, sb].find(s => s?.flag === 'taglia');
    const fresh = l.ageH === null ? null : l.ageH <= (/Lottomatica|Planetwin/.test(l.bookmaker) ? 6 : 24);
    const checks: CheckItem[] = [
      { id: 'value', label: 'Valore ≥ ' + Math.round(TIP_MIN_EDGE * 100) + '%', ok: l.edge >= TIP_MIN_EDGE, note: 'Quota ' + l.odds.toFixed(2) + ' contro quota giusta ' + (1 / l.pTrue).toFixed(2) + ': +' + (l.edge * 100).toFixed(1) + '%.' },
      { id: 'sharp', label: 'Riferimento Pinnacle', ok: l.source === 'Pinnacle', note: l.source === 'Pinnacle' ? 'Probabilità vera dal bookmaker dei professionisti.' : 'Pinnacle non quota: media del mercato (più debole).' },
      { id: 'fresh', label: 'Quota recente', ok: fresh, note: l.ageH === null ? 'Età della quota non nota: controlla sul sito.' : 'Letta ' + (l.ageH < 1 ? 'meno di un’ora fa' : Math.round(l.ageH) + ' ore fa') + '.' },
      { id: 'move', label: 'Mercato a favore', ok: mv ? mv.kind === 'steam' : null, note: mv ? (mv.kind === 'steam' ? 'Pinnacle è sceso: la probabilità è salita di ' + (mv.dOpen * 100).toFixed(1) + ' punti. Il bookmaker italiano non si è ancora adeguato.' : 'Pinnacle è salito: il mercato va contro (' + (mv.dOpen * 100).toFixed(1) + ' punti).') : 'Quota stabile dalla prima scansione.' },
      { id: 'model', label: 'Modello d’accordo', ok: l.modelAgrees, note: l.modelAgrees === null ? 'Il modello non copre questa partita.' : l.modelAgrees ? 'Anche il modello QUORUM vede valore.' : 'Il modello QUORUM non vede valore.' },
      { id: 'news', label: 'Nessuna assenza pesante', ok: !heavy, note: heavy ? 'Una squadra ha assenze che pesano più del 15%: il prezzo può essere già cambiato.' : 'Nessuna assenza pesante segnalata.' },
      { id: 'history', label: 'Storico non negativo', ok: bad ? false : (sl?.flag === 'spingi' || sm?.flag === 'spingi') ? true : null, note: bad ? bad.key + ': CLV negativo nel registro (' + ((bad.clv ?? 0) * 100).toFixed(1) + '%). Meglio evitare.' : (sl?.flag === 'spingi' || sm?.flag === 'spingi') ? 'Campionato o mercato con CLV positivo nel registro.' : 'Storico ancora corto per giudicare.' },
    ];
    const fails = checks.filter(c => c.ok === false).map(c => c.id), critical = fails.some(f => ['value', 'fresh', 'history'].includes(f));
    const grade = critical ? 'C' : fails.length === 0 ? 'A' : fails.length === 1 ? 'B' : 'C';
    // Stake: quarter Kelly in units (1 unit = 1% of the balance), halved for grade B, capped by the user's rule.
    const kel = Math.max(0, 0.25 * l.edge / (l.odds - 1)) * (grade === 'B' ? 0.5 : grade === 'C' ? 0 : 1);
    const frac = Math.min(kel, opts.capBps / 10000, 0.02), units = Math.round(frac * 100 * 10) / 10;
    const stakeCents = frac > 0 ? Math.max(100, Math.floor(opts.equityCents * frac / 50) * 50) : 0;
    out.push({ all: l.all, fixtureId: l.fixtureId, fixture: l.fixture, competition: l.competition, kickoff: l.kickoff, market: l.market, label: l.label, odds: l.odds, bookmaker: l.bookmaker, fair: 1 / l.pTrue, edge: l.edge, pTrue: l.pTrue, source: l.source, ageH: l.ageH, units, stakeCents, grade, checks, move: mv?.dOpen ?? null });
  }
  // Watchlist: steam with an Italian price close to value (0–3%): if the Italian book does not move, it may become value.
  const watch = moves.filter(m => m.kind === 'steam' && m.edge !== null && m.edge > -0.01 && m.edge < TIP_MIN_EDGE && !out.some(o => o.fixtureId === m.fixtureId && o.market === m.market)).slice(0, 10);
  const order = { A: 0, B: 1, C: 2 };
  // Doubles of the method, only with legs that pass the checklist (A or B): ¼ Kelly capped at 1% (half for a B leg).
  const ok = new Map(out.filter(o => o.grade !== 'C').map(o => [o.fixtureId + ':' + o.market, o]));
  const doubles = picks.doubles.filter(x => x.legs.every(l => ok.has(l.fixtureId + ':' + l.market))).map(x => {
    const legs = x.legs.map(l => ok.get(l.fixtureId + ':' + l.market)!), grade = legs.every(l => l.grade === 'A') ? 'A' : 'B';
    const kel = Math.max(0, 0.25 * x.edge / (x.odds - 1)) * (grade === 'B' ? 0.5 : 1), frac = Math.min(kel, opts.capBps / 10000, 0.01);
    return { legs: legs.map(l => ({ fixtureId: l.fixtureId, fixture: l.fixture, competition: l.competition, kickoff: l.kickoff, market: l.market, label: l.label, odds: l.odds, bookmaker: l.bookmaker, pTrue: l.pTrue, grade: l.grade })), odds: x.odds, p: x.p, edge: x.edge, grade, units: Math.round(frac * 1000) / 10 };
  });
  return { list: out.sort((a, b) => order[a.grade] - order[b.grade] || b.edge - a.edge), doubles, watch, compared: picks.compared, matches: picks.matches };
}

// Prices reported by users when they register a bet ("I played it at 2.60"): newer than the scan, they replace the
// Italian price of that market and the opportunity is re-graded (a stale price must not stay grade A).
export type PriceReport = { odds: number; at: string; book?: string };
export function applyReports<T extends { list: any[] }>(opp: T, reports: Record<string, PriceReport>, t = Date.now()): T {
  const list = opp.list.map(o => {
    const r = reports[o.fixtureId + ':' + o.market]; if (!r || !(r.odds > 1)) return o;
    const readAt = o.ageH === null ? 0 : t - o.ageH * 3600000; if (Date.parse(r.at) <= readAt || Math.abs(r.odds - o.odds) < 0.01) return o;
    const am = /^(auto|agg):(.+)$/.exec(r.book ?? ''), auto = am ? am[2] : null, onDemand = am?.[1] === 'agg';
    const edge = o.pTrue * r.odds - 1, hhmm = new Date(r.at).toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
    const checks = o.checks.map((c: CheckItem) => c.id === 'value' ? { ...c, ok: edge >= TIP_MIN_EDGE, note: (auto ? (onDemand ? 'Aggiornata ora su richiesta: ' : 'Ricontrollata in automatico: ') + auto + ' alle ' : 'Quota aggiornata da un utente alle ') + hhmm + ': ' + r.odds.toFixed(2) + ' (prima ' + o.odds.toFixed(2) + '). Quota giusta ' + (1 / o.pTrue).toFixed(2) + ': ' + (edge >= 0 ? '+' : '') + (edge * 100).toFixed(1) + '%.' }
      : c.id === 'fresh' ? { ...c, ok: true, note: auto ? 'Quota riletta alle ' + hhmm + ', poco prima della partita.' : 'Quota segnalata alle ' + hhmm + ' da chi l’ha appena giocata.' } : c);
    const fails = checks.filter((c: CheckItem) => c.ok === false).map((c: CheckItem) => c.id), critical = fails.some((f: string) => ['value', 'fresh', 'history'].includes(f));
    const grade = critical ? 'C' : fails.length === 0 ? 'A' : fails.length === 1 ? 'B' : 'C';
    const kel = Math.max(0, 0.25 * edge / (r.odds - 1)) * (grade === 'B' ? 0.5 : grade === 'C' ? 0 : 1);
    return { ...o, odds: r.odds, edge, grade, checks, units: Math.round(Math.min(kel, 0.02) * 1000) / 10, reported: { odds: r.odds, at: r.at, before: o.odds, auto: !!auto, onDemand } };
  });
  const order: Record<string, number> = { A: 0, B: 1, C: 2 };
  return { ...opp, list: list.sort((a, b) => order[a.grade] - order[b.grade] || b.edge - a.edge) };
}

// ---- Sales goal: the method goes on sale only when it has a measured edge. ----
export const SALES_GOAL = { singles: 300, clv: 0.02, t: 2, checkpoint: { date: '2027-01-31', singles: 150, clv: 0.01 }, deadline: '2027-03-31', extension: '2027-06-30' };
export function salesGoal(p: { n: number; clv: number | null; clvN: number; tClv: number | null; tProfit?: number | null; units?: number }, t = Date.now()) {
  const g = SALES_GOAL;
  const checks = [
    { id: 'n', label: 'Singole chiuse nel registro', value: p.n, target: g.singles, ok: p.n >= g.singles },
    { id: 'clv', label: 'CLV medio', value: p.clv ?? 0, target: g.clv, ok: p.clvN >= g.singles * 0.8 && (p.clv ?? 0) >= g.clv },
    { id: 't', label: 'Vantaggio statisticamente certo (CLV a 2 errori standard da zero)', value: p.tClv ?? 0, target: g.t, ok: (p.tClv ?? 0) >= g.t },
    { id: 'units', label: 'Risultato in unità non negativo', value: p.units ?? 0, target: 0, ok: (p.units ?? 0) >= 0 },
  ];
  const daysLeft = Math.ceil((Date.parse(g.deadline + 'T23:59:59Z') - t) / 86400000);
  const reached = checks.every(c => c.ok);
  const phase = reached ? 'raggiunto' : t > Date.parse(g.extension + 'T23:59:59Z') ? 'fallito' : t > Date.parse(g.deadline + 'T23:59:59Z') ? 'proroga' : t > Date.parse(g.checkpoint.date + 'T23:59:59Z') ? 'seconda-fase' : 'prima-fase';
  const checkpointOk = p.n >= g.checkpoint.singles && (p.clv ?? 0) >= g.checkpoint.clv;
  return { ...g, checks, reached, phase, daysLeft, checkpointOk };
}
