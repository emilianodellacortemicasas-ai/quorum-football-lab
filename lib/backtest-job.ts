// Weekly automatic backtest: refits the walk-forward test on the latest results and refreshes the
// measured calibration used by predictions and tickets.
import { env } from 'cloudflare:workers';
import { storedResults } from './sportmonks';
import { backtest } from './backtest';

const WEEK = 7 * 86400000;
export async function refreshBacktest(force = false) {
  const row = await env.DB!.prepare("SELECT built_at FROM model_state WHERE id='backtest'").first<{ built_at: string }>();
  if (!force && row && Date.now() - Date.parse(row.built_at) < WEEK) {
    // New ticket types (schemi, multiple, risultati esatti): rebuild the ticket backtest once if it predates them.
    const tb = await env.DB!.prepare("SELECT payload FROM model_state WHERE id='ticket-backtest'").first<{ payload: string }>().catch(() => null);
    const prev = tb ? JSON.parse(tb.payload) : null;
    if (!prev || !prev.series || !prev.markets) await refreshTicketBacktest().catch(() => null);
    return false;
  }
  const results = await storedResults(), config = { label: 'v2.1' }, testDays = 150;
  const metrics = backtest(results, config, testDays);
  await env.DB!.prepare("INSERT INTO model_state (id,built_at,payload) VALUES ('backtest',?,?) ON CONFLICT(id) DO UPDATE SET built_at=excluded.built_at,payload=excluded.payload")
    .bind(new Date().toISOString(), JSON.stringify({ metrics, config, testDays, results: results.length })).run();
  await refreshTicketBacktest().catch(() => null);
  return true;
}

// Ticket backtest on real historical prices (football-data.co.uk), refreshed with the weekly backtest.
import { FD_CODES, matchFd, parseFd, type FdRow } from './football-data-contract.ts';
import { ticketBacktest } from './ticket-backtest';
async function fdRows(comp: string, season: string): Promise<FdRow[]> {
  const id = 'fd:' + FD_CODES[comp] + ':' + season;
  const row = await env.DB!.prepare('SELECT built_at,payload FROM model_state WHERE id=?').bind(id).first<{ built_at: string; payload: string }>();
  if (row && Date.now() - Date.parse(row.built_at) < 6 * 86400000) return JSON.parse(row.payload);
  const r = await fetch('https://www.football-data.co.uk/mmz4281/' + season + '/' + FD_CODES[comp] + '.csv', { signal: AbortSignal.timeout(30000) });
  if (!r.ok) { if (row) return JSON.parse(row.payload); throw new Error('football-data ' + comp + ' ' + season + ': HTTP ' + r.status); }
  const rows = parseFd(await r.text(), comp);
  await env.DB!.prepare('INSERT INTO model_state (id,built_at,payload) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET built_at=excluded.built_at,payload=excluded.payload').bind(id, new Date().toISOString(), JSON.stringify(rows)).run();
  return rows;
}
export async function refreshTicketBacktest(weights?: number[]) {
  const results = await storedResults();
  const seasons = new Set(results.map(r => { const d = new Date(r.ts), y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; return String(y % 100).padStart(2, '0') + String((y + 1) % 100).padStart(2, '0'); }));
  const fd: FdRow[] = [], missing: string[] = [];
  for (const comp of Object.keys(FD_CODES)) for (const s of seasons) { try { fd.push(...await fdRows(comp, s)); } catch { missing.push(comp + ' ' + s); } }
  const odds = matchFd(results.filter(r => r.comp !== 'Coppa Italia'), fd);
  if (weights) return { compare: weights.map(w => ({ w, ...ticketBacktest(results, odds, 240, Date.now(), w) })) } as any;
  const out = { ...ticketBacktest(results, odds, 240), matchedOdds: odds.size, oddsRows: fd.length, missing };
  await env.DB!.prepare("INSERT INTO model_state (id,built_at,payload) VALUES ('ticket-backtest',?,?) ON CONFLICT(id) DO UPDATE SET built_at=excluded.built_at,payload=excluded.payload").bind(out.at, JSON.stringify(out)).run();
  return out;
}

// European cups backtest: historical odds of The Odds API (20 credits per match day and competition),
// downloaded once and kept in D1, then the same market-based model used live for the cups.
import { CUP_SPORT, cupBacktest, cupPlan, snapshotPath, trimSnapshot } from './cup-backtest';
import { oddsFeed } from './odds-provider';
import type { OddsEvent } from './scanner-contract';
const CUP_RESERVE = 3000;
export async function refreshCupBacktest(maxCalls = 25, force = false) {
  const prev = await env.DB!.prepare("SELECT built_at,payload FROM model_state WHERE id='cup-backtest'").first<{ built_at: string; payload: string }>().catch(() => null);
  const prevOut = prev ? JSON.parse(prev.payload) : null;
  if (!force && prevOut?.complete && Date.now() - Date.parse(prev!.built_at) < WEEK) return { skipped: true, ...prevOut.progress };
  const results = (await storedResults()).filter(r => CUP_SPORT[r.comp]);
  const plan = cupPlan(results);
  const have = new Set(((await env.DB!.prepare("SELECT id FROM model_state WHERE id LIKE 'cuphist:%'").all<{ id: string }>()).results || []).map(r => r.id));
  let fetched = 0, remaining: number | null = null, stopped = '';
  for (const p of plan) {
    if (have.has(p.id)) continue;
    if (fetched >= maxCalls) break;
    if (remaining !== null && remaining < CUP_RESERVE) { stopped = 'Riserva crediti raggiunta (' + remaining + ').'; break; }
    try {
      const r = await oddsFeed(snapshotPath(p.sport, p.date), 60);
      if (r.remaining !== null && Number.isFinite(Number(r.remaining))) remaining = Number(r.remaining);
      await env.DB!.prepare('INSERT INTO model_state (id,built_at,payload) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET built_at=excluded.built_at,payload=excluded.payload').bind(p.id, new Date().toISOString(), JSON.stringify(trimSnapshot(r.payload, p.date))).run();
      have.add(p.id); fetched++;
    } catch (e) { stopped = e instanceof Error ? e.message : 'Errore quote storiche'; break; }
  }
  const missing = plan.filter(p => !have.has(p.id)).length;
  const snaps = new Map<string, OddsEvent[]>();
  for (const p of plan) if (have.has(p.id)) { const row = await env.DB!.prepare('SELECT payload FROM model_state WHERE id=?').bind(p.id).first<{ payload: string }>(); if (row) snaps.set(p.id, JSON.parse(row.payload)); }
  const progress = { planned: plan.length, have: plan.length - missing, fetched, missing, remaining, stopped: stopped || null };
  const out = { ...cupBacktest(results, snaps), complete: missing === 0, progress };
  await env.DB!.prepare("INSERT INTO model_state (id,built_at,payload) VALUES ('cup-backtest',?,?) ON CONFLICT(id) DO UPDATE SET built_at=excluded.built_at,payload=excluded.payload").bind(out.at, JSON.stringify(out)).run();
  return progress;
}
