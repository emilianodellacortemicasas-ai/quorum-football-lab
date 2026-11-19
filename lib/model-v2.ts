// QUORUM model v2 — pure functions, no I/O.
// Team strength (attack/defence) fitted per league on all its matches, weighted by recency,
// with league home advantage, shrinkage for teams with little data and Dixon–Coles low-score correction.

export const MODEL_V2 = 'quorum-v2 · rating att/dif + forma + campo + Dixon–Coles';
export const HALF_LIFE_DAYS = 120;   // a match 120 days old counts half
export const PRIOR_GOALS = 4;        // shrinkage: pseudo-goals toward the league average

export type Result = { id: number; ts: number; comp: string; season: number | null; homeId: number; awayId: number; home: string; away: string; hg: number; ag: number };
export type TeamRating = { name: string; att: number; def: number; n: number };
export type LeagueModel = { mu: number; homeAdv: number; rho: number; teams: Record<string, TeamRating>; matches: number };
export type TableRow = { teamId: number; name: string; played: number; points: number; gf: number; ga: number; position: number };

// 90-minute score (2ND_HALF is cumulative; CURRENT may include extra time).
export function parseResult(f: any, comp: string | null): Result | null {
  if (!comp || !['FT', 'AET', 'FT_PEN'].includes(f?.state?.state) || !Number.isFinite(f?.starting_at_timestamp)) return null;
  const h = f.participants?.find((x: any) => x.meta?.location === 'home'), a = f.participants?.find((x: any) => x.meta?.location === 'away');
  const s = f.scores?.filter((x: any) => x.description === '2ND_HALF') || [];
  const hg = s.find((x: any) => x.score?.participant === 'home')?.score?.goals, ag = s.find((x: any) => x.score?.participant === 'away')?.score?.goals;
  if (!h?.id || !a?.id || !Number.isInteger(hg) || !Number.isInteger(ag) || hg < 0 || ag < 0 || hg > 15 || ag > 15) return null;
  return { id: f.id, ts: f.starting_at_timestamp * 1000, comp, season: Number.isInteger(f.season_id) ? f.season_id : null, homeId: h.id, awayId: a.id, home: h.name, away: a.name, hg, ag };
}

const weight = (ts: number, now: number) => Math.pow(0.5, Math.max(0, now - ts) / 86400000 / HALF_LIFE_DAYS);

// Dixon–Coles dependence correction for low scores.
export function tau(i: number, j: number, lh: number, la: number, rho: number) {
  if (i === 0 && j === 0) return 1 - lh * la * rho;
  if (i === 0 && j === 1) return 1 + lh * rho;
  if (i === 1 && j === 0) return 1 + la * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

// log λ_home = mu + homeAdv + att_home + def_away ; log λ_away = mu + att_away + def_home  (def = defensive weakness)
export function fitLeague(results: Result[], now: number): LeagueModel | null {
  const rows = results.filter(r => r.ts < now).map(r => ({ ...r, w: weight(r.ts, now) }));
  if (rows.length < 30) return null;
  const ids = [...new Set(rows.flatMap(r => [r.homeId, r.awayId]))].map(String);
  const att: Record<string, number> = {}, def: Record<string, number> = {}, n: Record<string, number> = {}, name: Record<string, string> = {};
  for (const id of ids) { att[id] = 0; def[id] = 0; n[id] = 0; }
  for (const r of rows) { n[r.homeId]++; n[r.awayId]++; name[r.homeId] = r.home; name[r.awayId] = r.away; }
  const W = rows.reduce((s, r) => s + r.w, 0);
  let mu = Math.log(Math.max(0.2, rows.reduce((s, r) => s + r.w * (r.hg + r.ag), 0) / (2 * W))), homeAdv = 0.2;
  for (let it = 0; it < 60; it++) {
    // home advantage and base rate: closed-form multiplicative updates
    let gh = 0, eh = 0, gAll = 0, eAll = 0;
    for (const r of rows) {
      const lh = Math.exp(mu + homeAdv + att[r.homeId] + def[r.awayId]), la = Math.exp(mu + att[r.awayId] + def[r.homeId]);
      gh += r.w * r.hg; eh += r.w * lh; gAll += r.w * (r.hg + r.ag); eAll += r.w * (lh + la);
    }
    mu += Math.log(gAll / eAll);
    let gh2 = 0, eh2 = 0, ga2 = 0, ea2 = 0;
    for (const r of rows) { gh2 += r.w * r.hg; eh2 += r.w * Math.exp(mu + homeAdv + att[r.homeId] + def[r.awayId]); ga2 += r.w * r.ag; ea2 += r.w * Math.exp(mu + att[r.awayId] + def[r.homeId]); }
    homeAdv = Math.max(-0.1, Math.min(0.6, homeAdv + Math.log(gh2 / eh2) - Math.log(ga2 / ea2)));
    // attack then defence, each with shrinkage toward 0 (league average)
    const base = Math.exp(mu);
    const gF: Record<string, number> = {}, eF: Record<string, number> = {}, gA: Record<string, number> = {}, eA: Record<string, number> = {};
    for (const id of ids) { gF[id] = 0; eF[id] = 0; gA[id] = 0; eA[id] = 0; }
    for (const r of rows) {
      const lh = Math.exp(mu + homeAdv + att[r.homeId] + def[r.awayId]), la = Math.exp(mu + att[r.awayId] + def[r.homeId]);
      gF[r.homeId] += r.w * r.hg; eF[r.homeId] += r.w * lh / Math.exp(att[r.homeId]);
      gF[r.awayId] += r.w * r.ag; eF[r.awayId] += r.w * la / Math.exp(att[r.awayId]);
      gA[r.awayId] += r.w * r.hg; eA[r.awayId] += r.w * lh / Math.exp(def[r.awayId]);
      gA[r.homeId] += r.w * r.ag; eA[r.homeId] += r.w * la / Math.exp(def[r.homeId]);
    }
    for (const id of ids) {
      att[id] = Math.log((gF[id] + PRIOR_GOALS * base) / (eF[id] + PRIOR_GOALS * base));
      def[id] = Math.log((gA[id] + PRIOR_GOALS * base) / (eA[id] + PRIOR_GOALS * base));
    }
    const ma = ids.reduce((s, id) => s + att[id], 0) / ids.length, md = ids.reduce((s, id) => s + def[id], 0) / ids.length;
    for (const id of ids) { att[id] -= ma; def[id] -= md; }
    mu += ma + md;
  }
  // rho by grid search on the weighted likelihood of the low-score cells
  let rho = 0, best = -Infinity;
  for (let r0 = -0.2; r0 <= 0.101; r0 += 0.01) {
    let ll = 0;
    for (const r of rows) {
      if (r.hg > 1 || r.ag > 1) continue;
      const lh = Math.exp(mu + homeAdv + att[r.homeId] + def[r.awayId]), la = Math.exp(mu + att[r.awayId] + def[r.homeId]), t = tau(r.hg, r.ag, lh, la, r0);
      if (t <= 0) { ll = -Infinity; break; }
      ll += r.w * Math.log(t);
    }
    if (ll > best) { best = ll; rho = Math.round(r0 * 100) / 100; }
  }
  const teams: Record<string, TeamRating> = {};
  for (const id of ids) teams[id] = { name: name[id], att: att[id], def: def[id], n: n[id] };
  return { mu, homeAdv, rho, teams, matches: rows.length };
}

export function lambdas(m: LeagueModel, homeId: number, awayId: number, neutral = false) {
  const h = m.teams[homeId], a = m.teams[awayId];
  if (!h || !a || h.n < 3 || a.n < 3) return null;
  const lh = Math.exp(m.mu + (neutral ? 0 : m.homeAdv) + h.att + a.def), la = Math.exp(m.mu + a.att + h.def);
  return Number.isFinite(lh) && Number.isFinite(la) && lh > 0.05 && la > 0.05 && lh < 6 && la < 6 ? { lh, la } : null;
}

// League table from the current-season results of one competition.
export function table(results: Result[], season: number | null): TableRow[] {
  const rows = new Map<number, TableRow>();
  const get = (id: number, name: string) => { if (!rows.has(id)) rows.set(id, { teamId: id, name, played: 0, points: 0, gf: 0, ga: 0, position: 0 }); return rows.get(id)!; };
  for (const r of results) {
    if (season !== null && r.season !== season) continue;
    const h = get(r.homeId, r.home), a = get(r.awayId, r.away);
    h.played++; a.played++; h.gf += r.hg; h.ga += r.ag; a.gf += r.ag; a.ga += r.hg;
    if (r.hg > r.ag) h.points += 3; else if (r.hg < r.ag) a.points += 3; else { h.points++; a.points++; }
  }
  const sorted = [...rows.values()].sort((x, y) => y.points - x.points || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.name.localeCompare(y.name));
  sorted.forEach((r, i) => r.position = i + 1);
  return sorted;
}

// Last n results of a team (most recent first) as W/D/L string, e.g. "VVNPV".
export function form(results: Result[], teamId: number, n = 5) {
  return results.filter(r => r.homeId === teamId || r.awayId === teamId).sort((a, b) => b.ts - a.ts).slice(0, n)
    .map(r => { const own = r.homeId === teamId ? r.hg : r.ag, opp = r.homeId === teamId ? r.ag : r.hg; return own > opp ? 'V' : own < opp ? 'P' : 'N'; }).join('');
}
