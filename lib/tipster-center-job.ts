// Centro Tipster: loads the records (QUORUM's tipster method or the user's own plays), the closing prices and
// the earlier scans, then runs the pure analysis of tipster-center.ts. Refreshed after every scan (every 3 hours).
import { env } from 'cloudflare:workers';
import { latestPredictions } from './scanner';
import { applyReports, margins, movements, opportunities, performance, segments, streaks, type CenterRec, type PriceReport } from './tipster-center';

const db = () => env.DB!;
const pair: Record<string, [string, string]> = { homeDraw: ['home', 'draw'], drawAway: ['draw', 'away'], homeAway: ['home', 'away'] };
const sharpOf = (mk: any, k: string): number | null => {
  if (!mk) return null;
  if (pair[k]) { const a = sharpOf(mk, pair[k][0]), b = sharpOf(mk, pair[k][1]); return a !== null && b !== null ? a + b : null; }
  const m = mk[k]; return m ? (Number.isFinite(m.pSharp) ? m.pSharp : Number.isFinite(m.pMarket) ? m.pMarket : null) : null;
};

// Closing probability of each leg (last scan before kickoff), one batched query; the product for multiples.
async function withClosing(recs: Omit<CenterRec, 'closeP'>[]): Promise<CenterRec[]> {
  const now = Date.now(), need = new Map<string, string>();
  for (const r of recs) for (const l of r.legs) if (l.kickoff && Date.parse(l.kickoff) < now && /^sm-\d+$/.test(l.fixtureId)) need.set(l.fixtureId, l.kickoff);
  const ids = [...need.keys()], close = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 40) {
    const part = ids.slice(i, i + 40);
    const res = await db().batch(part.map(id => db().prepare('SELECT fixture_id,markets FROM scanner_matches WHERE fixture_id=? AND created_at<=? ORDER BY created_at DESC LIMIT 1').bind(id, need.get(id)!)));
    res.forEach((x: any) => { const row = x.results?.[0]; if (row) close.set(row.fixture_id, JSON.parse(row.markets)); });
  }
  return recs.map(r => {
    let p: number | null = 1;
    for (const l of r.legs) { const mk = close.get(l.fixtureId), x = mk ? sharpOf(mk, l.market) : null; if (x === null) { p = null; break; } p *= x; }
    return { ...r, closeP: p };
  });
}

export async function methodRecords(): Promise<CenterRec[]> {
  // Real prices reported before kickoff by those who played the pick: if lower than the price QUORUM had read,
  // the register uses the reported one (the price really available), so results and CLV are not flattered.
  const reports = await priceReports().catch(() => ({} as Record<string, PriceReport>));
  const real = (l: any) => { const r = reports[l.fixtureId + ':' + l.market]; return r && r.odds < l.odds && Date.parse(r.at) < Date.parse(l.kickoff) ? r.odds : l.odds; };
  const rows = (await db().prepare("SELECT id,kind,legs,odds,p,result,created_at FROM scanner_tickets WHERE kind IN ('tipster-singola','tipster-doppia') ORDER BY created_at DESC LIMIT 600").all<any>()).results;
  return withClosing(rows.map(r => { const legs = JSON.parse(r.legs).map((l: any) => ({ fixtureId: l.fixtureId, competition: l.competition, market: l.market, label: l.label, odds: real(l), bookmaker: l.bookmaker, kickoff: l.kickoff }));
    return { id: r.id, kind: r.kind, legs, odds: legs.reduce((q: number, l: any) => q * l.odds, 1), p: r.p, result: r.result ?? null, createdAt: r.created_at }; }));
}
export async function myRecords(owner: string): Promise<CenterRec[]> {
  const rows = (await db().prepare("SELECT id,fixture_id,competition,market,odds,probability,status,snapshot,created_at FROM bets WHERE owner=? AND fixture_id NOT LIKE 'system:%' ORDER BY created_at DESC LIMIT 400").bind(owner).all<any>()).results;
  return withClosing(rows.map(r => {
    let snap: any = {}; try { snap = JSON.parse(r.snapshot); } catch { }
    const legs = Array.isArray(snap.legs) && snap.legs.length ? snap.legs.map((l: any) => ({ fixtureId: l.fixtureId, competition: l.competition, market: l.market, label: l.label, odds: l.odds, kickoff: l.kickoff }))
      : [{ fixtureId: r.fixture_id, competition: r.competition, market: r.market, odds: r.odds, kickoff: snap.kickoff }];
    return { id: r.id, kind: legs.length > 1 ? 'multipla' : 'singola', legs, odds: r.odds, p: r.probability, result: ['won', 'lost', 'void'].includes(r.status) ? r.status : null, createdAt: r.created_at };
  }));
}

// First scan of each upcoming fixture and the scan of about 3 hours ago: the reference points of the movements.
async function snapshots(fixtures: string[]) {
  const nowIso = new Date().toISOString(), prevIso = new Date(Date.now() - 2.5 * 3600000).toISOString();
  const open = new Map<string, { at: string; markets: any }>(), prev = new Map<string, { at: string; markets: any }>();
  for (let i = 0; i < fixtures.length; i += 40) {
    const part = fixtures.slice(i, i + 40);
    const res = await db().batch(part.flatMap(id => [
      db().prepare('SELECT fixture_id,markets,created_at FROM scanner_matches WHERE fixture_id=? ORDER BY created_at ASC LIMIT 1').bind(id),
      db().prepare('SELECT fixture_id,markets,created_at FROM scanner_matches WHERE fixture_id=? AND created_at<=? ORDER BY created_at DESC LIMIT 1').bind(id, prevIso),
    ]));
    res.forEach((x: any, j: number) => { const row = x.results?.[0]; if (!row || row.created_at > nowIso) return; (j % 2 ? prev : open).set(row.fixture_id, { at: row.created_at, markets: JSON.parse(row.markets) }); });
  }
  return { open, prev };
}

export async function buildCenter(source: 'metodo' | 'mie' = 'metodo', owner?: string) {
  const [lp, recs] = await Promise.all([latestPredictions(), source === 'mie' && owner ? myRecords(owner) : methodRecords()]);
  const rows = lp.matches as any[], snaps = await snapshots(rows.map(r => r.fixture_id));
  const moves = movements(rows, snaps.open, snaps.prev), seg = segments(recs);
  // The checklist's "history" uses QUORUM's tipster record (larger and objective) also when you look at your plays.
  const methodSeg = source === 'metodo' ? seg : segments(await methodRecords());
  const opp = opportunities(rows, moves, methodSeg, { equityCents: 0, capBps: 2000 });
  return { at: new Date().toISOString(), run: lp.run ? { finished_at: lp.run.finished_at } : null, source, performance: performance(recs), segments: seg, streaks: streaks(recs), moves, margins: margins(rows), opportunities: opp };
}

// After every scan: the method's analysis is saved, so the page opens instantly.
export async function refreshCenter() {
  const out = await buildCenter('metodo');
  await db().prepare("INSERT INTO model_state (id,built_at,payload) VALUES ('tipster-center',?,?) ON CONFLICT(id) DO UPDATE SET built_at=excluded.built_at,payload=excluded.payload").bind(out.at, JSON.stringify(out)).run();
  return out;
}
export async function storedCenter() {
  const row = await db().prepare("SELECT built_at,payload FROM model_state WHERE id='tipster-center'").first<{ built_at: string; payload: string }>().catch(() => null);
  const last = await db().prepare("SELECT finished_at FROM scanner_runs WHERE status='ok' ORDER BY started_at DESC LIMIT 1").first<{ finished_at: string }>().catch(() => null);
  // Rebuilt when a scan is newer or the saved analysis predates a new field (format version).
  if (row && (!last || row.built_at >= last.finished_at)) { const x = JSON.parse(row.payload); if (x.performance?.curve && x.opportunities?.doubles) return x; }
  return refreshCenter();
}

// Prices reported by users (kept 3 days).
export async function priceReports(): Promise<Record<string, PriceReport>> {
  const row = await db().prepare("SELECT payload FROM model_state WHERE id='it-reports'").first<{ payload: string }>().catch(() => null);
  return row ? JSON.parse(row.payload) : {};
}
export async function reportPrice(key: string, odds: number) {
  if (!/^sm-\d{1,12}:[A-Za-z0-9]{2,20}$/.test(key) || !(odds > 1 && odds < 1000)) throw new Error('Segnalazione non valida.');
  const all = await priceReports(), now = Date.now();
  for (const [k, v] of Object.entries(all)) if (now - Date.parse(v.at) > 3 * 86400000) delete all[k];
  all[key] = { odds: Math.round(odds * 100) / 100, at: new Date().toISOString() };
  await db().prepare("INSERT INTO model_state (id,built_at,payload) VALUES ('it-reports',?,?) ON CONFLICT(id) DO UPDATE SET built_at=excluded.built_at,payload=excluded.payload").bind(new Date().toISOString(), JSON.stringify(all)).run();
  return true;
}
export async function centerWithReports(source: 'metodo' | 'mie', owner?: string) {
  const c = source === 'mie' && owner ? await buildCenter('mie', owner) : await storedCenter();
  return { ...c, opportunities: applyReports(c.opportunities, await priceReports()) };
}
