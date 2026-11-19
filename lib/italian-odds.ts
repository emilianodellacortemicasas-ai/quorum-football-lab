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
  'Serie A': { cat: 'italy', names: ['serie a'] }, 'Coppa Italia': { cat: 'italy', names: ['coppa italia'] },
  'Premier League': { cat: 'england', names: ['premier league'] }, 'La Liga': { cat: 'spain', names: ['laliga', 'la liga'] },
  'Bundesliga': { cat: 'germany', names: ['bundesliga'] }, 'Ligue 1': { cat: 'france', names: ['ligue 1'] },
};
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

type Meta = { tournaments: Record<string, number>; books: Record<string, string>; markets: Record<string, Record<string, string>> };
// marketId → outcomeId → QUORUM key (home/draw/away, over15…under35, btts/noGoal)
function marketMap(markets: any[]) {
  const out: Record<string, Record<string, string>> = {};
  for (const m of markets) {
    const name = norm(m.marketName ?? m.name), id = String(m.marketId ?? m.id ?? ''), period = norm(m.period ?? 'fulltime');
    if (!id || (period && !period.includes('full') && period !== 'ft' && period !== 'regular')) continue;
    if (/half|1st|2nd|corner|card|booking|team|player|handicap|asian|exact|minute/.test(name)) continue;
    const outcomes = list(m.outcomes), map: Record<string, string> = {};
    const line = Number(m.handicap ?? m.line ?? m.marketLine);
    for (const o of outcomes) {
      const oid = String(o.outcomeId ?? o.id ?? ''), on = norm(o.outcomeName ?? o.name);
      if (!oid) continue;
      if (/(full time result|1x2|match result|^result)/.test(name) && !name.includes('double')) map[oid] = on === '1' || on.includes('home') ? 'home' : on === 'x' || on.includes('draw') ? 'draw' : on === '2' || on.includes('away') ? 'away' : '';
      else if (/over under|total/.test(name) && [1.5, 2.5, 3.5].includes(line)) map[oid] = (on.includes('over') ? 'over' : on.includes('under') ? 'under' : '') + String(line).replace('.', '');
      else if (/both teams to score|btts|goal no goal/.test(name)) map[oid] = on === 'yes' || on === 'si' ? 'btts' : on === 'no' ? 'noGoal' : '';
    }
    const clean = Object.fromEntries(Object.entries(map).filter(([, v]) => v && !/^(over|under)$/.test(v)));
    if (Object.keys(clean).length) out[id] = clean;
  }
  return out;
}

async function meta(key: string): Promise<Meta> {
  return cached<Meta>('oddspapi:meta', 7 * 86400000, async () => {
    const [tour, books, markets] = [await api('tournaments?sportId=' + SOCCER, key), await api('bookmakers', key), await api('markets?sportId=' + SOCCER, key)];
    const tournaments: Record<string, number> = {};
    for (const [comp, c] of Object.entries(COMPS)) {
      const t = list(tour).find(x => norm(x.categorySlug ?? x.categoryName).includes(c.cat) && c.names.some(n => norm(x.tournamentName ?? x.tournamentSlug) === n || norm(x.tournamentSlug) === n.replace(/ /g, ' ')));
      if (t) tournaments[comp] = Number(t.tournamentId);
    }
    const slugs = list(books).map(b => typeof b === 'string' ? b : String(b.slug ?? b.bookmaker ?? b.bookmakerSlug ?? ''));
    const pick = (re: RegExp) => slugs.filter(s => re.test(s)).sort((a, b) => (b.includes('it') ? 1 : 0) - (a.includes('it') ? 1 : 0) || a.length - b.length)[0];
    return { tournaments, books: { lottomatica: pick(/lottomatica/i) ?? '', planetwin: pick(/planet ?win/i) ?? '' }, markets: marketMap(list(markets)) };
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
    ['oddspapi:odds', 12 * 3600000, ids.filter(([c]) => c !== 'Coppa Italia')],
    ['oddspapi:odds:cup', 24 * 3600000, ids.filter(([c]) => c === 'Coppa Italia')],
  ];
  const out: ItalianFixture[] = [];
  for (const [cacheId, age, group] of groups) {
    if (!group.length) continue;
    try { out.push(...await cached<ItalianFixture[]>(cacheId, age, () => fetchGroup(group.map(x => x[1])))); }
    catch (e) { if (!out.length && cacheId === 'oddspapi:odds') throw e; }
  }
  return out;
  async function fetchGroup(tids: number[]) {
    const byFixture = new Map<string, ItalianFixture>();
    for (const b of IT_BOOKS) {
      const slug = m.books[b.key]; if (!slug) continue;
      await new Promise(r => setTimeout(r, 1100));
      const data = list(await api('odds-by-tournaments?bookmaker=' + encodeURIComponent(slug) + '&tournamentIds=' + tids.join(',') + '&oddsFormat=decimal', key!));
      for (const f of data) {
        const fid = String(f.fixtureId), board = f.bookmakerOdds?.[slug]; if (!board) continue;
        const fx: ItalianFixture = byFixture.get(fid) ?? { home: f.participant1Name, away: f.participant2Name, start: f.startTime, comp: compOf(Number(f.tournamentId)), quotes: {} };
        for (const [mid, mk] of Object.entries<any>(board.markets ?? {})) {
          const omap = m.markets[mid]; if (!omap) continue;
          for (const [oid, o] of Object.entries<any>(mk.outcomes ?? {})) {
            const q = omap[oid], p = o?.players?.['0'] ?? o?.players?.[0];
            if (!q || !p || p.active === false || !Number.isFinite(p.price) || p.price <= 1) continue;
            (fx.quotes[q] ??= {})[b.label] = { odds: p.price, link: typeof p.betslip === 'string' ? p.betslip : typeof board.fixturePath === 'string' ? board.fixturePath : null };
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
  const row = await db().prepare("SELECT built_at FROM model_state WHERE id='oddspapi:odds'").first<{ built_at: string }>();
  return { connected: true, tournaments: m.tournaments, books: m.books, markets: Object.keys(m.markets).length, oddsUpdatedAt: row?.built_at ?? null };
}

// Owner diagnostic: one request (Serie A, Lottomatica) summarised, plus the market map.
export async function italianDebug() {
  const key = await credentialValue('oddspapi'); if (!key) return { connected: false };
  const m = await meta(key);
  const raw = await api('odds-by-tournaments?bookmaker=' + encodeURIComponent(m.books.lottomatica) + '&tournamentIds=' + m.tournaments['Serie A'] + '&oddsFormat=decimal', key);
  const data = list(raw), f = data[0], board = f?.bookmakerOdds ? Object.values<any>(f.bookmakerOdds)[0] : null;
  return { type: Array.isArray(raw) ? 'array' : typeof raw, topKeys: raw && typeof raw === 'object' ? Object.keys(raw).slice(0, 10) : null, n: data.length,
    fixtureKeys: f ? Object.keys(f) : null, books: f?.bookmakerOdds ? Object.keys(f.bookmakerOdds) : null,
    marketIds: board?.markets ? Object.keys(board.markets).slice(0, 40) : null,
    m101: board?.markets?.['101'] ?? null, map: m.markets };
}
