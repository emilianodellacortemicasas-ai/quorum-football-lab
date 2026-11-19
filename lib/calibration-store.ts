// Loads the measured calibration: model table from the latest backtest, live table from settled predictions.
import { env } from 'cloudflare:workers';
import { buildTable, familyOf, type CalTable, type Sample } from './calibration';

const db = () => env.DB!;
export type Calibration = { model: CalTable | null; live: CalTable | null; backtestSamples: number; liveSamples: number; backtestAt: string | null };

export async function loadCalibration(): Promise<Calibration> {
  const bt = await db().prepare("SELECT built_at,payload FROM model_state WHERE id='backtest'").first<{ built_at: string; payload: string }>();
  const m = bt ? JSON.parse(bt.payload)?.metrics : null;
  // Final QUORUM estimate of each settled outcome = the last scan before kickoff.
  const rows = (await db().prepare(`SELECT r.market, r.p_blend, r.result FROM scanner_rows r
    JOIN (SELECT fixture_id, market, MAX(created_at) AS last FROM scanner_rows WHERE result IN ('won','lost') AND created_at <= kickoff GROUP BY fixture_id, market) l
      ON l.fixture_id = r.fixture_id AND l.market = r.market AND l.last = r.created_at`).all<{ market: string; p_blend: number; result: string }>()).results;
  const samples: Sample[] = [];
  for (const r of rows) { const f = familyOf(r.market); if (f) samples.push({ f, p: r.p_blend, hit: r.result === 'won' }); }
  return { model: m?.calibration ?? null, live: samples.length ? buildTable(samples) : null, backtestSamples: m?.samples ?? 0, liveSamples: samples.length, backtestAt: bt?.built_at ?? null };
}
