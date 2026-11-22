// Italian bookmakers (Lottomatica, Planetwin365) via OddsPapi. Free tier: 250 requests/month, so everything
// is cached in D1: catalogue (tournaments, bookmakers, markets) for 7 days, odds for 10 hours.
// Cost per odds refresh: one request per bookmaker for all six competitions → ~2 requests, about 120 per month.
import { env } from 'cloudflare:workers';
import { credentialValue } from './vault';
import { sameTeam } from './scanner-contract';

const db = () => env.DB!;
const BASE = 'https://api.oddspapi.io/v4/';
const SOCCER = 10;
export const IT_BOOKS = [{ key: 'lottomatica', label: 'Lottomatica' }, { key: 'planetwin', label: 'Planetwin365' }] as const;
const COMPS: Record<string, { cat: string; names: string[] }> = {
  'Serie A': { cat: 'italy', names: ['serie a'] }, 'Serie B': { cat: 'italy', names: ['serie b'] }, 'Championship': { cat: 'england', names: ['championship'] },
  'Premier League': { cat: 'england', names: ['premier league'] }, 'La Liga': { cat: 'spain', names: ['laliga', 'la liga'] },
  'Bundesliga': { cat: 'germany', names: ['bundesliga'] }, 'Ligue 1': { cat: 'france', names: ['ligue 1'] },
};
const MINOR = ['Serie B', 'Championship'];
const norm = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function api(path: string, key: string) {
  const r = await fetch(BASE + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(key), { signal: AbortSignal.timeout(25000) });
  if (!r.ok) { const body = (await r.text().catch(() => '')).replace(/apiKey=[^&\s"]+/g, 'apiKey=***').slice(0, 300); throw new Error(r.status === 429 ? 'OddsPapi: limite di richieste raggiunto.' : 'OddsPapi HTTP ' + r.status + ' su ' + path.split('?')[0] + ': ' + body); }
  return r.json() as Promise<any>;
}
const list = (x: any): any[] => Array.isArray(x) ? x : Array.isArray(x?.data) ? x.data : x && typeof x === 'object' ? Object.values(x) : [];
async function cached<T>(id: string, maxAgeMs: number, build: () => Promise<T>): Promise<T> {
  const row = await db().prepare('SELECT built_at,payload FROM model_state WHERE id=?').bind(id).first<{ built_at: string; payload: string }>();
  if (row && row.payload !== '[]' && Date.now() - Date.parse(row.built_at) < maxAgeMs) return JSON.parse(row.payload) as T;
  try {
    const v = await build();
    await db().prepare('INSERT INTO model_state (id,built_at,payload) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET built_at=excluded.built_at,payload=excluded.payload').bind(id, new Date().toISOString(), JSON.stringify(v)).run();
    return v;
  } catch (e) { if (row) return JSON.parse(row.payload) as T; throw e; }
}

type Meta = { tournaments: Record<string, number>; books: Record<string, string>; teams: Record<string, string> };
// OddsPapi's soccer market ids are stable (docs: concepts → soccer market map); one id per line.
const MARKETS: Record<string, Record<string, string>> = {
  '101': { '101': 'home', '102': 'draw', '103': 'away' },
  '104': { '104': 'btts', '105': 'noGoal' },
  '101902': { '101902': 'homeDraw', '101904': 'drawAway', '101903': 'homeAway' },
  '108': { '108': 'over15', '109': 'under15' },
  '1010': { '1010': 'over25', '1011': 'under25' },
  '1012': { '1012': 'over35', '1013': 'under35' },
};

async function meta(key: string): Promise<Meta> {
  return cached<Meta>('oddspapi:meta3', 7 * 86400000, async () => {
    const pause = () => new Promise(r => setTimeout(r, 1100));
    const tour = await api('tournaments?sportId=' + SOCCER, key); await pause();
    const books = await api('bookmakers', key); await pause();
    const parts = await api('participants?sportId=' + SOCCER, key);
    const teams: Record<string, string> = {};
    if (parts && !Array.isArray(parts) && typeof parts === 'object' && !parts.data) { for (const [k, v] of Object.entries<any>(parts)) teams[k] = typeof v === 'string' ? v : String(v?.participantName ?? v?.name ?? ''); }
    else for (const x of list(parts)) teams[String(x.participantId ?? x.id)] = String(x.participantName ?? x.name ?? '');
    const tournaments: Record<string, number> = {};
    for (const [comp, c] of Object.entries(COMPS)) {
      const t = list(tour).find(x => norm(x.categorySlug ?? x.categoryName).includes(c.cat) && c.names.some(n => norm(x.tournamentName ?? x.tournamentSlug) === n || norm(x.tournamentSlug) === n.replace(/ /g, ' ')));
      if (t) tournaments[comp] = Number(t.tournamentId);
    }
    const slugs = list(books).map(b => typeof b === 'string' ? b : String(b.slug ?? b.bookmaker ?? b.bookmakerSlug ?? ''));
    const pick = (re: RegExp) => slugs.filter(s => re.test(s)).sort((a, b) => (b.includes('it') ? 1 : 0) - (a.includes('it') ? 1 : 0) || a.length - b.length)[0];
    return { tournaments, books: { lottomatica: pick(/lottomatica/i) ?? '', planetwin: pick(/planet ?win/i) ?? '' }, teams };
  });
}

export type ItalianFixture = { home: string; away: string; start: string; comp: string; quotes: Record<string, Record<string, { odds: number; link: string | null }>> };
export async function italianOdds(): Promise<ItalianFixture[] | null> {
  const key = await credentialValue('oddspapi'); if (!key) return null;
  const m = await meta(key);
  const ids = Object.entries(m.tournaments); if (!ids.length) return [];
  const compOf = (tid: number) => ids.find(([, v]) => v === tid)?.[0] ?? '';
  // The API accepts at most 5 tournaments per call: the 5 leagues every 12h, Coppa Italia every 24h.
  // 2 bookmakers × (2 + 1) calls a day ≈ 180 requests a month, plus ~13 for the weekly catalogue.
  const groups: [string, number, [string, number][]][] = [
    ['oddspapi:odds2', 12 * 3600000, ids.filter(([c]) => !MINOR.includes(c))],
    ['oddspapi:odds:minor', 12 * 3600000, ids.filter(([c]) => MINOR.includes(c))],
  ];
  const out: ItalianFixture[] = [];
  for (const [cacheId, age, group] of groups) {
    if (!group.length) continue;
    try { out.push(...await cached<ItalianFixture[]>(cacheId, age, () => fetchGroup(group.map(x => x[1])))); }
    catch (e) { if (!out.length && cacheId === 'oddspapi:odds2') throw e; }
  }
  return out;
  async function fetchGroup(tids: number[]) {
    const byFixture = new Map<string, ItalianFixture>();
    // Planetwin365 belongs to Lottomatica and shows the same prices: one request, both names.
    for (const b of IT_BOOKS.filter(x => x.key === 'lottomatica' || !m.books.lottomatica)) {
      const slug = m.books[b.key]; if (!slug) continue;
      await new Promise(r => setTimeout(r, 1100));
      const data = list(await api('odds-by-tournaments?bookmaker=' + encodeURIComponent(slug) + '&tournamentIds=' + tids.join(',') + '&oddsFormat=decimal', key!));
      for (const f of data) {
        const fid = String(f.fixtureId), board = f.bookmakerOdds?.[slug]; if (!board) continue;
        const fx: ItalianFixture = byFixture.get(fid) ?? { home: f.participant1Name ?? m.teams[String(f.participant1Id)], away: f.participant2Name ?? m.teams[String(f.participant2Id)], start: f.startTime, comp: compOf(Number(f.tournamentId)), quotes: {} };
        for (const [mid, mk] of Object.entries<any>(board.markets ?? {})) {
          const omap = MARKETS[mid]; if (!omap) continue;
          for (const [oid, o] of Object.entries<any>(mk.outcomes ?? {})) {
            const q = omap[oid], p = o?.players?.['0'] ?? o?.players?.[0];
            if (!q || !p || p.active === false || !Number.isFinite(p.price) || p.price <= 1) continue;
            const quote = { odds: p.price, link: typeof p.betslip === 'string' ? p.betslip : typeof board.fixturePath === 'string' ? board.fixturePath : null };
            (fx.quotes[q] ??= {})[b.label] = quote; if (b.key === 'lottomatica') fx.quotes[q]['Planetwin365'] = quote;
          }
        }
        byFixture.set(fid, fx);
      }
    }
    const res = [...byFixture.values()].filter(f => f.home && f.away && Object.keys(f.quotes).length);
    if (!res.length) throw new Error('nessuna quota riconosciuta');
    return res;
  }
}

export function matchItalian(fix: { home: string; away: string; kickoff: string; competition: string }, list: ItalianFixture[]) {
  const t = Date.parse(fix.kickoff);
  return list.find(x => (!x.comp || x.comp === fix.competition) && Math.abs(Date.parse(x.start) - t) <= 3 * 3600000 && sameTeam(fix.home, x.home) && sameTeam(fix.away, x.away)) ?? null;
}

// Admin check of the configuration, without spending odds requests beyond the cached ones.
export async function italianStatus() {
  const key = await credentialValue('oddspapi'); if (!key) return { connected: false };
  const m = await meta(key);
  const row = await db().prepare("SELECT built_at FROM model_state WHERE id='oddspapi:odds2'").first<{ built_at: string }>();
  return { connected: true, tournaments: m.tournaments, books: m.books, teams: Object.keys(m.teams).length, oddsUpdatedAt: row?.built_at ?? null };
}

// Owner diagnostic: one request (Serie A, Lottomatica) summarised, plus the market map.
export async function italianDebug() {
  const key = await credentialValue('oddspapi'); if (!key) return { connected: false };
  const m = await meta(key);
  const raw = await api('odds-by-tournaments?bookmaker=' + encodeURIComponent(m.books.lottomatica) + '&tournamentIds=' + m.tournaments['Serie A'] + '&oddsFormat=decimal', key);
  const data = list(raw), f = data[0], board = f?.bookmakerOdds ? Object.values<any>(f.bookmakerOdds)[0] : null;
  return { type: Array.isArray(raw) ? 'array' : typeof raw, topKeys: raw && typeof raw === 'object' ? Object.keys(raw).slice(0, 10) : null, n: data.length,
    fixtureKeys: f ? Object.keys(f) : null, books: f?.bookmakerOdds ? Object.keys(f.bookmakerOdds) : null,
    teams: Object.keys(m.teams).length, home: m.teams[String(f?.participant1Id)], away: m.teams[String(f?.participant2Id)], btts: board?.markets?.['104'] ? Object.keys(board.markets['104'].outcomes ?? {}) : null };
}

// Owner diagnostic: soccer markets whose name matches a pattern (one request).
export async function italianMarkets(q: string) {
  const key = await credentialValue('oddspapi'); if (!key) return { connected: false };
  const re = new RegExp(q, 'i');
  return list(await api('markets?sportId=' + SOCCER, key)).filter(m => re.test(String(m.marketName ?? m.name ?? ''))).slice(0, 60)
    .map(m => ({ id: m.marketId ?? m.id, name: m.marketName ?? m.name, period: m.period, line: m.handicap ?? m.line, outcomes: list(m.outcomes).map(o => [o.outcomeId ?? o.id, o.outcomeName ?? o.name]) }));
}
