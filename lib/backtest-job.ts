// Weekly automatic backtest: refits the walk-forward test on the latest results and refreshes the
// measured calibration used by predictions and tickets.
import { env } from 'cloudflare:workers';
import { storedResults } from './sportmonks';
import { backtest } from './backtest';

const WEEK = 7 * 86400000;
export async function refreshBacktest(force = false) {
  const row = await env.DB!.prepare("SELECT built_at FROM model_state WHERE id='backtest'").first<{ built_at: string }>();
  if (!force && row && Date.now() - Date.parse(row.built_at) < WEEK) return false;
  const results = await storedResults(), config = { label: 'v2.1' }, testDays = 150;
  const metrics = backtest(results, config, testDays);
  await env.DB!.prepare("INSERT INTO model_state (id,built_at,payload) VALUES ('backtest',?,?) ON CONFLICT(id) DO UPDATE SET built_at=excluded.built_at,payload=excluded.payload")
    .bind(new Date().toISOString(), JSON.stringify({ metrics, config, testDays, results: results.length })).run();
  return true;
}
