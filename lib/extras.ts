// Extra markets: corners, cards, penalties (awarded / missed) and anytime goalscorers.
// Pure functions. Sportmonks type ids: statistics 34 corners, 84 yellow cards, 83 red cards;
// events 14 goal, 15 own goal, 16 penalty scored, 17 penalty missed.
export type Extras = { corners: [number, number] | null; yellow: [number, number] | null; red: [number, number] | null; penAwarded: [number, number] | null; penMissed: [number, number] | null; scorers: { id: number; name: string; side: 'home' | 'away'; teamId: number }[] | null };
export type ExtraRow = { ts: number; comp: string; homeId: number; awayId: number; x: Extras };

export function parseExtras(f: any): Extras {
  const h = f.participants?.find((x: any) => x.meta?.location === 'home'), a = f.participants?.find((x: any) => x.meta?.location === 'away');
  const stat = (type: number): [number, number] | null => {
    if (!Array.isArray(f.statistics)) return null;
    const v = (loc: string, id: number) => f.statistics.find((s: any) => s.type_id === type && (s.location === loc || s.participant_id === id))?.data?.value;
    const x = v('home', h?.id), y = v('away', a?.id);
    return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 ? [x, y] : type === 83 && (Number.isFinite(x) || Number.isFinite(y)) ? [Number(x) || 0, Number(y) || 0] : null;
  };
  let penAwarded: [number, number] | null = null, penMissed: [number, number] | null = null, scorers: Extras['scorers'] = null;
  if (Array.isArray(f.events)) {
    const side = (e: any): 0 | 1 | null => e.participant_id === h?.id ? 0 : e.participant_id === a?.id ? 1 : null;
    penAwarded = [0, 0]; penMissed = [0, 0]; scorers = [];
    for (const e of f.events) {
      const s = side(e); if (s === null) continue;
      if (e.type_id === 16 || e.type_id === 17) penAwarded[s]++;
      if (e.type_id === 17) penMissed[s]++;
      if ((e.type_id === 14 || e.type_id === 16) && Number.isInteger(e.player_id) && e.player_name) scorers.push({ id: e.player_id, name: e.player_name, side: s ? 'away' : 'home', teamId: s ? a.id : h.id });
    }
  }
  // red cards default to 0 when the statistic is simply absent but corners/yellows are present
  const corners = stat(34), yellow = stat(84), red = stat(83) ?? (corners && yellow ? [0, 0] as [number, number] : null);
  return { corners, yellow, red, penAwarded, penMissed, scorers };
}

const decay = (ts: number, now: number, hl: number) => Math.pow(0.5, Math.max(0, now - ts) / 86400000 / hl);
type Rate = { for: number; against: number };
export type CountModel = { home: number; away: number; teams: Record<string, Rate> };
export type ExtrasModel = { corners?: CountModel; yellow?: CountModel; red?: CountModel; pen?: CountModel; missRate: number; scorers: Record<string, { id: number; name: string; share: number }[]> };

// Multiplicative team factors for a count statistic (same idea as goals): league home/away mean × team for × opponent against.
function fitCount(rows: ExtraRow[], pick: (x: Extras) => [number, number] | null, now: number, hl: number, prior: number): CountModel | undefined {
  const data = rows.map(r => ({ r, v: pick(r.x), w: decay(r.ts, now, hl) })).filter(d => d.v) as { r: ExtraRow; v: [number, number]; w: number }[];
  if (data.length < 30) return undefined;
  const W = data.reduce((s, d) => s + d.w, 0), home = data.reduce((s, d) => s + d.w * d.v[0], 0) / W, away = data.reduce((s, d) => s + d.w * d.v[1], 0) / W;
  const acc: Record<string, { f: number; ef: number; a: number; ea: number }> = {};
  const get = (id: number) => acc[id] ??= { f: 0, ef: 0, a: 0, ea: 0 };
  for (const d of data) {
    const H = get(d.r.homeId), A = get(d.r.awayId);
    H.f += d.w * d.v[0]; H.ef += d.w * home; H.a += d.w * d.v[1]; H.ea += d.w * away;
    A.f += d.w * d.v[1]; A.ef += d.w * away; A.a += d.w * d.v[0]; A.ea += d.w * home;
  }
  const teams: Record<string, Rate> = {};
  for (const [id, x] of Object.entries(acc)) teams[id] = { for: (x.f + prior) / (x.ef + prior), against: (x.a + prior) / (x.ea + prior) };
  return { home, away, teams };
}
export function expectedCount(m: CountModel | undefined, homeId: number, awayId: number): [number, number] | null {
  if (!m) return null;
  const h = m.teams[homeId] ?? { for: 1, against: 1 }, a = m.teams[awayId] ?? { for: 1, against: 1 };
  return [m.home * h.for * a.against, m.away * a.for * h.against];
}

export function fitExtras(rows: ExtraRow[], now: number): ExtrasModel {
  const pen = fitCount(rows, x => x.penAwarded, now, 365, 2);
  const tot = rows.reduce((s, r) => s + (r.x.penAwarded ? r.x.penAwarded[0] + r.x.penAwarded[1] : 0), 0), miss = rows.reduce((s, r) => s + (r.x.penMissed ? r.x.penMissed[0] + r.x.penMissed[1] : 0), 0);
  // goalscorers: share of team goals in the last ~12 months, recent goals weigh more (half-life 120 days)
  const goals: Record<string, Record<number, { name: string; w: number }>> = {}, teamTot: Record<string, number> = {};
  for (const r of rows) for (const s of r.x.scorers || []) {
    const w = decay(r.ts, now, 120); (goals[s.teamId] ??= {})[s.id] ??= { name: s.name, w: 0 };
    goals[s.teamId][s.id].w += w; teamTot[s.teamId] = (teamTot[s.teamId] || 0) + w;
  }
  const scorers: ExtrasModel['scorers'] = {};
  for (const [team, players] of Object.entries(goals)) scorers[team] = Object.entries(players).map(([id, p]) => ({ id: Number(id), name: p.name, share: p.w / (teamTot[team] || 1) })).sort((a, b) => b.share - a.share).slice(0, 14);
  return {
    corners: fitCount(rows, x => x.corners, now, 250, 6), yellow: fitCount(rows, x => x.yellow, now, 250, 4), red: fitCount(rows, x => x.red, now, 365, 1),
    pen, missRate: tot >= 20 ? Math.min(0.4, Math.max(0.1, (miss + 4) / (tot + 20))) : 0.22, scorers,
  };
}

// Probabilities derived from expected counts (Poisson for rare events).
export function penaltyProbs(m: ExtrasModel, homeId: number, awayId: number) {
  const e = expectedCount(m.pen, homeId, awayId); if (!e) return null;
  const lam = e[0] + e[1];
  return { awarded: 1 - Math.exp(-lam), missed: 1 - Math.exp(-lam * m.missRate), home: 1 - Math.exp(-e[0]), away: 1 - Math.exp(-e[1]), expected: lam };
}
// Anytime scorer: share of team goals × expected team goals, discounted 15% for minutes not played. Sidelined players excluded.
export function scorerProbs(m: ExtrasModel, teamId: number, teamLambda: number, out: string[] | null | undefined) {
  const absent = (out || []).map(s => s.toLowerCase());
  return (m.scorers[teamId] || []).filter(p => !absent.some(o => o.startsWith(p.name.toLowerCase()))).slice(0, 12)
    .map(p => ({ id: p.id, name: p.name, p: 1 - Math.exp(-p.share * teamLambda * 0.85) }));
}

// Absences and official line-ups: a team's expected goals drop by the share of goals its missing scorers
// usually provide. Injured/suspended: 50% of their share is lost (the replacement scores too).
// Confirmed line-up, scorer on the bench: 35% of the share (he may come on). Floor: −25%.
export function attackAdjustment(scorers: { id: number; name: string; share: number }[] | undefined, absent: Set<number>, starters: Set<number> | null) {
  let lost = 0; const missing: string[] = [], bench: string[] = [];
  for (const s of scorers || []) {
    if (absent.has(s.id)) { lost += s.share * 0.5; missing.push(s.name); }
    else if (starters && starters.size >= 11 && !starters.has(s.id)) { lost += s.share * 0.35; bench.push(s.name); }
  }
  return { factor: Math.max(0.75, 1 - lost), missing, bench };
}
