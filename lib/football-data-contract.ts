// Historical odds from football-data.co.uk (free CSV, market-average prices before kickoff).
// Pure parsing and matching to QUORUM's stored results. No imports.
export type FdRow = { comp: string; day: number; home: string; away: string; hg: number; ag: number; h: number; d: number; a: number; o25: number | null; u25: number | null };
export const FD_CODES: Record<string, string> = { 'Serie A': 'I1', 'Premier League': 'E0', 'La Liga': 'SP1', 'Bundesliga': 'D1', 'Ligue 1': 'F1' };
const DAY = 86400000;

function splitCsv(line: string) {
  const out: string[] = []; let cur = '', q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur); return out;
}
export function parseFd(csv: string, comp: string): FdRow[] {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const head = splitCsv(lines[0]).map(h => h.trim()), col = (n: string) => head.indexOf(n);
  const ix = { date: col('Date'), home: col('HomeTeam'), away: col('AwayTeam'), hg: col('FTHG'), ag: col('FTAG') };
  const pick = (names: string[]) => names.map(col).find(i => i >= 0) ?? -1;
  const oh = pick(['AvgH', 'BbAvH', 'B365H']), od = pick(['AvgD', 'BbAvD', 'B365D']), oa = pick(['AvgA', 'BbAvA', 'B365A']);
  const oo = pick(['Avg>2.5', 'BbAv>2.5', 'B365>2.5']), ou = pick(['Avg<2.5', 'BbAv<2.5', 'B365<2.5']);
  const rows: FdRow[] = [];
  for (const l of lines.slice(1)) {
    const c = splitCsv(l), m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec((c[ix.date] ?? '').trim()); if (!m) continue;
    const y = Number(m[3].length === 2 ? '20' + m[3] : m[3]), day = Date.UTC(y, Number(m[2]) - 1, Number(m[1]));
    const n = (i: number) => { const v = Number(c[i]); return i >= 0 && Number.isFinite(v) && v > 1 ? v : null; };
    const hg = Number(c[ix.hg]), ag = Number(c[ix.ag]), h = n(oh), d = n(od), a = n(oa);
    if (!Number.isFinite(hg) || !Number.isFinite(ag) || c[ix.hg] === '' || !h || !d || !a) continue;
    rows.push({ comp, day, home: c[ix.home], away: c[ix.away], hg, ag, h, d, a, o25: n(oo), u25: n(ou) });
  }
  return rows;
}

const ALIAS: [RegExp, string][] = [[/^man /, 'manchester '], [/^nott'?m /, 'nottingham '], [/^wolves$/, 'wolverhampton'], [/^ath /, 'atletico '], [/^ath bilbao$/, 'athletic bilbao'],
  [/^espanol$/, 'espanyol'], [/^vallecano$/, 'rayo vallecano'], [/^sociedad$/, 'real sociedad'], [/^m'?gladbach$/, 'monchengladbach'], [/^ein /, 'eintracht '], [/^fc koln$/, 'koln'],
  [/^paris sg$/, 'paris saint germain'], [/^st /, 'saint '], [/^spurs$/, 'tottenham'], [/^sheffield weds$/, 'sheffield wednesday'], [/^qpr$/, 'queens park rangers']];
export const normTeam = (s: string) => {
  let x = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, to] of ALIAS) x = x.replace(re, to);
  return x.replace(/'/g, '').replace(/\b(fc|cf|ac|as|ss|ssc|us|afc|sc|sv|vfb|vfl|tsg|bsc|rc|ogc|olympique|calcio|club|de|del|la)\b/g, ' ').replace(/\s+/g, ' ').trim();
};
// Share of the shorter name's words that start a word of the other name.
export function teamSim(a: string, b: string) {
  const x = normTeam(a).split(' ').filter(Boolean), y = normTeam(b).split(' ').filter(Boolean);
  if (!x.length || !y.length) return 0;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.filter(w => l.some(v => v.startsWith(w) || w.startsWith(v))).length / s.length;
}
// A football-data row matches a stored result when competition, score and date (±1 day) agree and at least
// one team name is recognisably the same. Each result is used once.
export function matchFd<T extends { id: string | number; ts: number; comp: string; home: string; away: string; hg: number; ag: number }>(results: T[], rows: FdRow[]) {
  const out = new Map<string | number, FdRow>();
  for (const r of rows) {
    let best: T | null = null, bs = 0;
    for (const x of results) {
      if (x.comp !== r.comp || x.hg !== r.hg || x.ag !== r.ag || Math.abs(x.ts - r.day) > 1.5 * DAY || out.has(x.id)) continue;
      const s = Math.max(teamSim(x.home, r.home), teamSim(x.away, r.away)) + 0.01 * (teamSim(x.home, r.home) + teamSim(x.away, r.away));
      if (s > bs) { bs = s; best = x; }
    }
    if (best && bs >= 0.5) out.set(best.id, r);
  }
  return out;
}
