// Italian bookmakers (Lottomatica, Planetwin365) via OddsPapi. Free tier: 250 requests/month, so everything
// is cached in D1: catalogue (tournaments, bookmakers, markets) for 7 days, odds for 10 hours.
// Cost per odds refresh: one request per bookmaker for all six competitions → ~2 requests, about 120 per month.
import { env } from 'cloudflare:workers';
import { credentialValue } from './vault';
import { sameTeam } from './scanner-contract';

const db = () => env.DB!;
const BASE = 'https://api.oddspapi.io/v4/';
const SOCCER = 10;
// Lottomatica (= Planetwin365, same prices) every 12h; Snai, Sisal and Eurobet every 72h for the comparison.
// Requests per month (free plan 250): 2 calls per refresh (≤ 5 tournaments each) → 120 + 3 × 20 + catalogue ≈ 187.
export const IT_BOOKS = [{ key: 'lottomatica', label: 'Lottomatica', re: /lottomatica/i, age: 12 }, { key: 'planetwin', label: 'Planetwin365', re: /planet ?win/i, age: 12 },
  { key: 'snai', label: 'Snai', re: /snai/i, age: 72 }, { key: 'sisal', label: 'Sisal', re: /sisal/i, age: 72 }, { key: 'eurobet', label: 'Eurobet', re: /eurobet/i, age: 72 }] as const;
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
const lastAt = new Map<string, string>();
async function cached<T>(id: string, maxAgeMs: number, build: () => Promise<T>): Promise<T> {
  const row = await db().prepare('SELECT built_at,payload FROM model_state WHERE id=?').bind(id).first<{ built_at: string; payload: string }>();
  if (row && row.payload !== '[]' && Date.now() - Date.parse(row.built_at) < maxAgeMs) { lastAt.set(id, row.built_at); return JSON.parse(row.payload) as T; }
  lastAt.set(id, new Date().toISOString());
  try {
    const v = await build();
    await db().prepare('INSERT INTO model_state (id,built_at,payload) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET built_at=excluded.built_at,payload=excluded.payload').bind(id, new Date().toISOString(), JSON.stringify(v)).run();
    return v;
  } catch (e) { if (row) { lastAt.set(id, row.built_at); return JSON.parse(row.payload) as T; } throw e; }
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
  // Correct score (risultato esatto), up to 5 goals per team.
  '10336': {'10354': 'exact:2-2', '10377': 'exact:1-5', '10380': 'exact:4-5', '10339': 'exact:3-0', '10347': 'exact:3-1', '10341': 'exact:5-0', '10373': 'exact:5-4', '10346': 'exact:2-1', '10379': 'exact:3-5', '10370': 'exact:2-4', '10345': 'exact:1-1', '10365': 'exact:5-3', '10381': 'exact:5-5', '10371': 'exact:3-4', '10337': 'exact:1-0', '10349': 'exact:5-1', '10369': 'exact:1-4', '10353': 'exact:1-2', '10352': 'exact:0-2', '10362': 'exact:2-3', '10344': 'exact:0-1', '10372': 'exact:4-4', '10355': 'exact:3-2', '10361': 'exact:1-3', '10348': 'exact:4-1', '10368': 'exact:0-4', '10360': 'exact:0-3', '10378': 'exact:2-5', '10338': 'exact:2-0', '10364': 'exact:4-3', '10356': 'exact:4-2', '10336': 'exact:0-0', '10340': 'exact:4-0', '10357': 'exact:5-2', '10376': 'exact:0-5', '10363': 'exact:3-3'},
};

async function meta(key: string): Promise<Meta> {
  return cached<Meta>('oddspapi:meta4', 14 * 86400000, async () => {
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
    return { tournaments, books: Object.fromEntries(IT_BOOKS.map(b => [b.key, pick(b.re) ?? ''])), teams };
  });
}

export type ItalianFixture = { home: string; away: string; start: string; comp: string; quotes: Record<string, Record<string, { odds: number; link: string | null }>>; at?: Record<string, string> };
export async function italianOdds(): Promise<ItalianFixture[] | null> {
  const key = await credentialValue('oddspapi'); if (!key) return null;
  const m = await meta(key);
  const ids = Object.entries(m.tournaments); if (!ids.length) return [];
  const compOf = (tid: number) => ids.find(([, v]) => v === tid)?.[0] ?? '';
  // The API accepts at most 5 tournaments per call: main leagues and minor leagues in two calls per bookmaker.
  const groups: [string, number[]][] = [['main', ids.filter(([c]) => !MINOR.includes(c)).map(x => x[1])], ['minor', ids.filter(([c]) => MINOR.includes(c)).map(x => x[1])]];
  const byFixture = new Map<string, ItalianFixture>();
  // Planetwin365 belongs to Lottomatica and shows the same prices: one request, both names.
  const books = IT_BOOKS.filter(b => b.key !== 'planetwin' || !m.books.lottomatica);
  let firstError: unknown = null, okMain = false;
  for (const b of books) {
    const slug = m.books[b.key]; if (!slug) continue;
    for (const [g, tids] of groups) {
      if (!tids.length) continue;
      try {
        const rows = await cached<any[]>('oddspapi:' + b.key + ':' + g, b.age * 3600000, async () => {
          await new Promise(r => setTimeout(r, 1100));
          return list(await api('odds-by-tournaments?bookmaker=' + encodeURIComponent(slug) + '&tournamentIds=' + tids.join(',') + '&oddsFormat=decimal', key!)).map(f => ({ fixtureId: f.fixtureId, participant1Name: f.participant1Name, participant2Name: f.participant2Name, participant1Id: f.participant1Id, participant2Id: f.participant2Id, startTime: f.startTime, tournamentId: f.tournamentId, board: f.bookmakerOdds?.[slug] ?? null }));
        });
        if (b.key === 'lottomatica' && g === 'main') okMain = true;
        const at = lastAt.get('oddspapi:' + b.key + ':' + g) ?? new Date().toISOString();
        for (const f of rows) {
          const fid = String(f.fixtureId), board = f.board; if (!board) continue;
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
          (fx.at ??= {})[b.label] = at; if (b.key === 'lottomatica') fx.at['Planetwin365'] = at;
          byFixture.set(fid, fx);
        }
      } catch (e) { firstError ??= e; }
    }
  }
  const out = [...byFixture.values()].filter(f => f.home && f.away && Object.keys(f.quotes).length);
  if (!out.length && firstError) throw firstError;
  void okMain;
  return out;
}

export function matchItalian(fix: { home: string; away: string; kickoff: string; competition: string }, list: ItalianFixture[]) {
  const t = Date.parse(fix.kickoff);
  return list.find(x => (!x.comp || x.comp === fix.competition) && Math.abs(Date.parse(x.start) - t) <= 3 * 3600000 && sameTeam(fix.home, x.home) && sameTeam(fix.away, x.away)) ?? null;
}

// Admin check of the configuration, without spending odds requests beyond the cached ones.
export async function italianStatus() {
  const key = await credentialValue('oddspapi'); if (!key) return { connected: false };
  const m = await meta(key);
  const row = await db().prepare("SELECT built_at FROM model_state WHERE id='oddspapi:lottomatica:main'").first<{ built_at: string }>();
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
