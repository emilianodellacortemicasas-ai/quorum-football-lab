'use client';
import { LiveButton, useLiveQuotes } from './live-quotes';
// "Costruisci la tua schedina": every match of the week, market by market, with the playable price
// (Lottomatica / Planetwin365 when available), the most probable outcomes and the value ones highlighted.
// The user builds a free ticket of any size; QUORUM measures it (reliability, value, stake, potential win).
import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, FlaskConical, Info, Plus, RefreshCw, Search, Star, Trash2, X } from 'lucide-react';
import { analyzeMatch, marketLabel, money, percent } from '../lib/math';
import { ticketReliability } from '../lib/calibration';
import type { RecordPlay, Selection } from '../lib/types';
import { Count, Ring } from './motion';
import { exactPicks, MULTIGOL, multigolP, scoreMatrix, comboSlot, customComboP, scorerShare, RESULT_PARTS, GOAL_PARTS, HT_OU_PARTS, comboAvailability } from '../lib/exact';

export type Opt = { fair?: boolean; fixtureId: string; fixture: string; competition: string; kickoff: string; market: string; label: string; group: string; p: number; odds: number; bookmaker: string; italian: boolean; se: number; value: number };
export type Player = { id: number; name: string; side: 'home' | 'away'; p: number };
export type Match = { fixtureId: string; fixture: string; competition: string; kickoff: string; opts: Opt[]; best: Set<string>; sc?: { home: number; away: number; p: number }[]; lh?: number; la?: number; players?: Player[]; itAt?: string | null };

const GROUPS: [string, string[]][] = [
  ['Esito finale', ['home', 'draw', 'away']],
  ['Doppia chance', ['homeDraw', 'drawAway', 'homeAway']],
  ['Under / Over', ['over05', 'under05', 'over15', 'under15', 'over25', 'under25', 'over35', 'under35', 'over45', 'under45', 'over55', 'under55']],
  ['Goal / No Goal', ['btts', 'noGoal']],
];
const SHORT: Record<string, string> = { home: '1', draw: 'X', away: '2', homeDraw: '1X', drawAway: 'X2', homeAway: '12', over15: 'Over 1,5', under15: 'Under 1,5', over25: 'Over 2,5', under25: 'Under 2,5', over35: 'Over 3,5', under35: 'Under 3,5', btts: 'Goal', noGoal: 'No Goal' };
const when = (s: string) => new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const dayKey = (s: string) => new Date(s).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' });
const pc = (p: number) => percent(p, p < 0.1 ? 1 : 0);
const SLIP_KEY = 'quorum-slip-v1';
const COMBO_GROUPS = ['Combo 1X', 'Combo X2', 'Combo 12', 'Combo 1', 'Combo X', 'Combo 2', 'Combo Gol'];
const EXTRA = ['Under / Over squadra', ...COMBO_GROUPS, 'Multigol', 'Risultato esatto', 'Corner', 'Cartellini', 'Corner e cartellini', 'Rigori', 'Marcatori'];

export function toOptions(r: any): Match | null {
  const mk = r.markets || {}, opts: Opt[] = [];
  const add = (key: string, group: string, label: string) => {
    const x = mk[key]; if (!x || !Number.isFinite(x.pBlend) || !Number.isFinite(x.bestOdds)) return;
    const it = x.it && Object.keys(x.it).length ? Object.entries<number>(x.it).sort((a, b) => b[1] - a[1]) : null;
    const odds = it ? it[0][1] : x.bestOdds; if (!(odds > 1)) return;
    opts.push({ fixtureId: r.fixture_id, fixture: r.fixture, competition: r.competition, kickoff: r.kickoff, market: key, label, group, p: x.pBlend, odds,
      bookmaker: it ? it.filter(e => e[1] === it[0][1]).map(e => e[0]).join(' / ') : x.bookmaker, italian: !!it, se: Number.isFinite(x.se) ? x.se : Math.sqrt(x.pBlend * (1 - x.pBlend) / 40), value: x.pBlend * odds - 1 });
  };
  for (const [g, keys] of GROUPS) for (const k of keys) add(k, g, marketLabel(k));
  for (const k of Object.keys(mk)) {
    if (k.startsWith('corners:') || k.startsWith('cards:')) add(k, 'Corner e cartellini', mk[k].label ?? marketLabel(k));
    else if (k.startsWith('scorer:')) add(k, 'Marcatori', mk[k].label ?? 'Marcatore');
  }
  // Combo, Multigol and exact scores from the score matrix aligned to the market (1X2 and Under/Over 2,5).
  // Exact scores use the Italian price when the bookmaker publishes it; the others start at the fair price,
  // which you can replace in the slip with the price you see on your account.
  const ex = Number.isFinite(r.lambda_home) && Number.isFinite(r.lambda_away) ? exactPicks([r])[0] : null;
  if (ex) {
    const base = { fixtureId: r.fixture_id, fixture: r.fixture, competition: r.competition, kickoff: r.kickoff };
    const fairOpt = (market: string, label: string, group: string, p: number): Opt => ({ ...base, market, label, group, p, odds: Math.round(100 / p) / 100, bookmaker: 'quota equa', italian: false, fair: true, se: Math.sqrt(p * (1 - p) / 40), value: 0 });
    for (const c of ex.combos) if (c.p >= 0.04) opts.push(fairOpt('combo:' + c.name, c.name, 'Combo ' + comboSlot(c.name), c.p));
    const u = mk.under25?.pBlend, b = ['home', 'draw', 'away'].map(k => mk[k]?.pBlend);
    const sc = b.every(x => Number.isFinite(x)) ? scoreMatrix(r.lambda_home, r.lambda_away, mk.meta?.rho ?? 0, { home: b[0], draw: b[1], away: b[2], ...(Number.isFinite(u) ? { under25: u } : {}) }) : null;
    if (sc) {
      // Every market QUORUM predicts is playable here: when the real price is missing, the fair one (≈).
      const has = (k: string) => opts.some(o => o.market === k);
      const tot = (n: number) => sc.filter(x => x.home + x.away > n).reduce((q, x) => q + x.p, 0);
      for (const line of [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]) {
        const k = String(line).replace('.', ''), pO = tot(line);
        for (const [side, p] of [['over', pO], ['under', 1 - pO]] as const) if (!has(side + k)) opts.push(fairOpt(side + k, (side === 'over' ? 'Over ' : 'Under ') + String(line).replace('.', ','), 'Under / Over', p));
      }
      const [ph, pd, pa] = b as number[];
      for (const [k, p] of [['homeDraw', ph + pd], ['drawAway', pd + pa], ['homeAway', ph + pa]] as const) if (!has(k)) opts.push(fairOpt(k, SHORT[k] ?? k, 'Doppia chance', p));
      const pG = sc.filter(x => x.home > 0 && x.away > 0).reduce((q, x) => q + x.p, 0);
      if (!has('btts')) opts.push(fairOpt('btts', 'Goal', 'Goal / No Goal', pG));
      if (!has('noGoal')) opts.push(fairOpt('noGoal', 'No Goal', 'Goal / No Goal', 1 - pG));
      // Corner and cards (model counts), penalties.
      const counts = mk.meta?.counts;
      if (counts) {
        const am = analyzeMatch({ lambdaHome: r.lambda_home, lambdaAway: r.lambda_away, context: { rho: mk.meta?.rho ?? 0 }, counts } as any)?.markets ?? {};
        for (const [fam, group, from, to] of [['corners', 'Corner', 6.5, 13.5], ['cards', 'Cartellini', 1.5, 7.5]] as const) for (let line = from; line <= to; line++) for (const side of ['over', 'under'] as const) {
          const k = fam + ':total:' + side + ':' + line, p = am[k]; if (!Number.isFinite(p)) continue;
          const real = opts.find(o => o.market === k); if (real) { real.group = group; continue; }
          opts.push(fairOpt(k, (fam === 'corners' ? 'Corner ' : 'Cartellini ') + (side === 'over' ? 'Over ' : 'Under ') + String(line).replace('.', ','), group, p));
        }
      }
      // Scorers: every player the model knows (goals of the last year × expected goals), with the bookmaker's
      // price when there is one; otherwise the fair price, editable in the slip.
      const scs = mk.meta?.scorers;
      if (scs) for (const [side, list] of [['home', scs.home], ['away', scs.away]] as const) for (const pl of (Array.isArray(list) ? list : []).slice(0, 14)) {
        if (!Number.isFinite(pl?.p) || pl.p < 0.02 || has('scorer:' + pl.id)) continue;
        const team = r.fixture.split(' – ')[side === 'home' ? 0 : 1] || '';
        opts.push({ ...fairOpt('scorer:' + pl.id, pl.name + ' (' + team + ')', 'Marcatori', Math.min(0.95, pl.p)) });
      }
      const pen = mk.meta?.penalties;
      if (pen && Number.isFinite(pen.awarded)) { opts.push(fairOpt('pen:awarded:yes', 'Rigore assegnato: Sì', 'Rigori', pen.awarded)); opts.push(fairOpt('pen:awarded:no', 'Rigore assegnato: No', 'Rigori', 1 - pen.awarded));
        if (Number.isFinite(pen.missed)) { opts.push(fairOpt('pen:missed:yes', 'Rigore sbagliato: Sì', 'Rigori', pen.missed)); opts.push(fairOpt('pen:missed:no', 'Rigore sbagliato: No', 'Rigori', 1 - pen.missed)); } }
      for (const [team, name] of [['home', r.fixture.split(' – ')[0] || 'Casa'], ['away', r.fixture.split(' – ')[1] || 'Ospite']] as const) for (const line of [0.5, 1.5, 2.5]) {
        const pO = sc.filter(x => (team === 'home' ? x.home : x.away) > line).reduce((q, x) => q + x.p, 0);
        opts.push(fairOpt('teamGoals:' + team + ':over:' + line, name + ' Over ' + String(line).replace('.', ','), 'Under / Over squadra', pO));
        opts.push(fairOpt('teamGoals:' + team + ':under:' + line, name + ' Under ' + String(line).replace('.', ','), 'Under / Over squadra', 1 - pO));
      }
      for (const [lo, hi] of MULTIGOL) { const p = multigolP(sc, lo, hi); opts.push(fairOpt('multigol:' + lo + '-' + hi, 'Multigol ' + lo + '-' + hi, 'Multigol', p)); }
      const itx = mk.itExact as Record<string, Record<string, number>> | undefined;
      for (const sco of sc.filter(x => x.home <= 5 && x.away <= 5).slice(0, 16)) {
        const k = sco.home + '-' + sco.away, q = itx?.[k] ? Object.entries(itx[k]).sort((a, c) => c[1] - a[1])[0] : null, o = fairOpt('exact:' + k, 'Risultato ' + k, 'Risultato esatto', sco.p);
        opts.push(q ? { ...o, odds: q[1], bookmaker: q[0], italian: true, fair: false, value: sco.p * q[1] - 1 } : o);
      }
    }
  }
  if (!opts.length) return null;
  // Data for "Costruisci la tua combo": score matrix, expected goals and the players who can score.
  let sc0: { home: number; away: number; p: number }[] | undefined, players: Player[] | undefined;
  { const u = mk.under25?.pBlend, b = ['home', 'draw', 'away'].map(k => mk[k]?.pBlend);
    if (Number.isFinite(r.lambda_home) && Number.isFinite(r.lambda_away) && b.every(x => Number.isFinite(x))) sc0 = scoreMatrix(r.lambda_home, r.lambda_away, mk.meta?.rho ?? 0, { home: b[0], draw: b[1], away: b[2], ...(Number.isFinite(u) ? { under25: u } : {}) });
    const scs = mk.meta?.scorers;
    if (scs) players = (['home', 'away'] as const).flatMap(side => (Array.isArray(scs[side]) ? scs[side] : []).filter((pl: any) => pl?.id && Number.isFinite(pl.p) && pl.p >= 0.02).slice(0, 14).map((pl: any) => ({ id: pl.id, name: pl.name, side, p: Number.isFinite(mk['scorer:' + pl.id]?.pBlend) ? mk['scorer:' + pl.id].pBlend : pl.p }))); }
  // Highlight: the two most probable outcomes with a real price (≥ 1,10) among the markets measured by the backtest.
  const measured = new Set(GROUPS.flatMap(g => g[1]));
  const best = new Set(opts.filter(o => !o.fair && o.odds >= 1.1 && measured.has(o.market)).sort((a, b) => b.p - a.p).slice(0, 2).map(o => o.market));
  return { fixtureId: r.fixture_id, fixture: r.fixture, competition: r.competition, kickoff: r.kickoff, opts, best, sc: sc0, lh: r.lambda_home, la: r.lambda_away, players, itAt: mk.itAt?.Lottomatica ?? (mk.itAt ? (Object.values(mk.itAt) as string[]).sort().at(-1) : null) };
}

export function BuilderView({ equityCents, onLab, notify, onRecord }: { equityCents: number; onLab: (s: Selection[]) => void; notify: (m: string) => void; onRecord?: RecordPlay }) {
  const [saving, setSaving] = useState(false), [share, setShare] = useState(false);
  useEffect(() => { try { setShare(localStorage.getItem('quorum-share') === '1'); } catch { } }, []);
  const toggleShare = (v: boolean) => { setShare(v); try { localStorage.setItem('quorum-share', v ? '1' : '0'); } catch { } };
  const [matches, setMatches] = useState<Match[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [liveBusy, setLiveBusy] = useState(false), [liveAt, setLiveAt] = useState<string | null>(null);
  // "Quote adesso" for the whole slip: one request per match (all Italian bookmakers), Lottomatica/Planet price applied to
  // each leg the feed quotes. Combos are not in the Italian feed: they keep their price and are flagged to check on the site.
  async function refreshSlip() {
    setLiveBusy(true); const got: Record<string, any> = {}; let err = '';
    for (const id of [...new Set(slip.map(l => l.fixtureId))]) {
      try { const r = await fetch('/api/scanner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'it-refresh', fixtureId: id }) }); const x: any = await r.json(); if (!r.ok) { err = x.error; break; } got[id] = x; } catch { err = 'Aggiornamento non riuscito.'; break; }
    }
    let up = 0, moved = 0; const missing: string[] = [];
    const next = slip.map(l => { const q = got[l.fixtureId]?.quotes?.[l.market] as Record<string, number> | undefined; if (!got[l.fixtureId]) return l;
      if (!q) { missing.push(l.label); return l; }
      const odds = q.Lottomatica ?? Math.max(...Object.values(q)); up++; if (Math.abs(odds - l.odds) >= 0.01) moved++;
      return { ...l, odds, value: l.p * odds - 1, fair: false, italian: true, bookmaker: q.Lottomatica ? 'Lottomatica / Planet' : Object.entries(q).sort((a, b) => b[1] - a[1])[0][0] }; });
    setSlip(next); setLiveBusy(false);
    const last = Object.values(got).at(-1); if (last) setLiveAt(last.at);
    notify((up ? up + (up === 1 ? ' quota aggiornata' : ' quote aggiornate') + (moved ? ', ' + moved + ' cambiate' : ', nessuna cambiata') + '. ' : '') + (missing.length ? 'Non quotate dal feed italiano (controllale sul sito): ' + missing.join(', ') + '. ' : '') + (err ? err + ' ' : '') + (last ? 'Ti restano ' + last.left + ' aggiornamenti oggi.' : ''));
  }
  const [slip, setSlip] = useState<Opt[]>([]), [league, setLeague] = useState('Tutte'), [q, setQ] = useState(''), [sort, setSort] = useState<'time' | 'prob'>('time');
  const [comboFor, setComboFor] = useState(''), [open, setOpen] = useState<Record<string, any>>({}), [stakeText, setStakeText] = useState(''), [sheet, setSheet] = useState(false);
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(SLIP_KEY) || '[]'); if (Array.isArray(s)) setSlip(s.filter((x: Opt) => Date.parse(x.kickoff) > Date.now())); } catch { } }, []);
  useEffect(() => { try { localStorage.setItem(SLIP_KEY, JSON.stringify(slip)); } catch { } }, [slip]);
  const live = useLiveQuotes(notify);
  // After "Quote adesso" on a match the fresh prices are saved on the match: reload quietly, the chips show them.
  async function quietReload() { try { const r = await fetch('/api/scanner?view=predictions', { cache: 'no-store' }); const d: any = await r.json(); if (r.ok) setMatches((d.matches || []).map(toOptions).filter(Boolean)); } catch { } }
  async function load() {
    setLoading(true); setError('');
    try { const r = await fetch('/api/scanner?view=predictions', { cache: 'no-store' }); const d: any = await r.json(); if (!r.ok) throw new Error(d.error); setMatches((d.matches || []).map(toOptions).filter(Boolean)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Partite non disponibili.'); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const inSlip = (o: Opt) => slip.some(s => s.fixtureId === o.fixtureId && s.market === o.market);
  function toggle(o: Opt) {
    if (Date.parse(o.kickoff) <= Date.now()) { notify('Partita già iniziata.'); return; }
    if (inSlip(o)) { setSlip(slip.filter(s => !(s.fixtureId === o.fixtureId && s.market === o.market))); return; }
    const same = slip.find(s => s.fixtureId === o.fixtureId);
    if (!same && slip.length >= 30) { notify('Massimo 30 eventi per schedina.'); return; }
    // One outcome per match: outcomes of the same match are linked, so their probabilities cannot be multiplied.
    setSlip([...slip.filter(s => s.fixtureId !== o.fixtureId), o].sort((a, b) => a.kickoff.localeCompare(b.kickoff)));
    if (same) notify('Sostituito ' + same.label + ' con ' + o.label + ': un solo esito per partita.');
  }

  const all = useMemo(() => matches.flatMap(m => m.opts), [matches]);
  const topProb = useMemo(() => all.filter(o => o.italian && o.odds >= 1.15 && /^(home|draw|away|homeDraw|drawAway|homeAway|over|under|btts|noGoal)/.test(o.market)).sort((a, b) => b.p - a.p).filter((o, i, a) => a.findIndex(x => x.fixtureId === o.fixtureId) === i).slice(0, 10), [all]);
  const topValue = useMemo(() => all.filter(o => o.italian && o.value >= 0.03 && o.p >= 0.45 && o.odds <= 3.5).sort((a, b) => b.value * b.p - a.value * a.p).filter((o, i, a) => a.findIndex(x => x.fixtureId === o.fixtureId) === i).slice(0, 8), [all]);
  const leagues = ['Tutte', ...new Set(matches.map(m => m.competition))];
  const shown = matches.filter(m => (league === 'Tutte' || m.competition === league) && (!q || m.fixture.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => sort === 'time' ? a.kickoff.localeCompare(b.kickoff) : Math.max(...b.opts.filter(o => b.best.has(o.market)).map(o => o.p)) - Math.max(...a.opts.filter(o => a.best.has(o.market)).map(o => o.p)));

  // Ticket measures.
  const odds = slip.reduce((s, l) => s * l.odds, 1), rel = slip.length ? ticketReliability(slip) : null, ev = rel ? rel.p * odds - 1 : 0;
  const kelly = ev > 0 ? Math.min(0.02, (ev / (odds - 1)) * 0.25) : 0, suggested = Math.max(100, Math.floor(equityCents * kelly / 100) * 100);
  const stake = stakeText ? Math.round(Number(stakeText.replace(',', '.')) * 100) || 0 : suggested;
  const verdict = !rel ? '' : rel.p >= 0.6 ? 'alta' : rel.p >= 0.35 ? 'media' : rel.p >= 0.12 ? 'bassa' : 'molto bassa';
  const oneIn = !rel ? '' : rel.p >= 0.5 ? 'vince circa ' + Math.round(rel.p * 10) + ' volte su 10' : 'vince circa 1 volta su ' + Math.max(2, Math.round(1 / Math.max(rel.p, 1e-6)));
  function copy() {
    const text = 'Schedina QUORUM · quota ' + odds.toFixed(2) + '\n' + slip.map(l => '• ' + l.fixture + ' — ' + l.label + ' @ ' + l.odds.toFixed(2)).join('\n') + '\nPuntata ' + money(stake) + ' · vincita potenziale ' + money(Math.round(stake * odds));
    navigator.clipboard?.writeText(text).then(() => notify('Schedina copiata: incollala dove vuoi.'), () => notify('Copia non riuscita.'));
  }

  const chip = (o: Opt, compact = false) => <button key={o.fixtureId + o.market} className={'pick-chip' + (inSlip(o) ? ' on' : '') + (o.value >= 0.03 && o.italian ? ' value' : '')} onClick={() => toggle(o)} title={o.bookmaker}>
    {compact && <small className="chip-fixture">{o.fixture} · {when(o.kickoff)}</small>}
    <span className="chip-label">{compact ? o.label : SHORT[o.market] ?? o.label}</span>
    <b>{o.odds.toFixed(2)}{o.fair ? <i title="Quota equa: sostituiscila con quella del tuo conto">≈</i> : !o.italian && <i title="Quota estera: non quotata da Lottomatica / Planetwin365">*</i>}</b>
    <em>{percent(o.p, 0)}</em>
  </button>;

  return <div className="builder">
    <div className="builder-main">
      <div className="page-heading"><div><p className="eyebrow">COSTRUISCI LA TUA SCHEDINA</p><h1>Scegli tu, QUORUM misura<span>.</span></h1><p>Tutte le partite della settimana con le quote di Lottomatica / Planetwin365. In evidenza gli esiti più probabili (★) e quelli con valore (bordo verde). Tocca una quota per aggiungerla: 2, 5, 10 o 20 eventi, come vuoi.</p></div>
        <button className="secondary" onClick={load}><RefreshCw size={16} className={loading ? 'spin' : ''} />Aggiorna</button></div>
      {loading ? <div className="empty"><span className="empty-icon"><RefreshCw className="spin" /></span><h3>Carico le partite…</h3></div>
        : error ? <div className="empty"><span className="empty-icon"><Info /></span><h3>Partite non disponibili</h3><p>{error}</p></div>
        : <>
          <section className="panel builder-top">
            <h3><Star size={16} /> Le più probabili della settimana</h3>
            <p className="small-note">Un esito per partita, solo quote italiane da 1,15 in su.</p>
            <div className="chip-row">{topProb.map(o => chip(o, true))}</div>
            {topValue.length > 0 && <><h3>Le quote con più valore</h3><p className="small-note">Probabilità almeno 45% e quota italiana che paga almeno il 3% in più del dovuto. Il valore da solo non garantisce nulla: guarda anche la probabilità.</p><div className="chip-row">{topValue.map(o => chip(o, true))}</div></>}
          </section>
          <ComboMaker matches={matches} pick={comboFor} setPick={setComboFor} onAdd={o => { if (Date.parse(o.kickoff) <= Date.now()) { notify('Partita già iniziata.'); return; } const same = slip.find(x => x.fixtureId === o.fixtureId); setSlip([...slip.filter(x => x.fixtureId !== o.fixtureId), o].sort((a, b) => a.kickoff.localeCompare(b.kickoff))); notify(same ? 'Combo inserita al posto di ' + same.label + ': un solo esito per partita.' : 'Combo aggiunta alla schedina.'); }} />
          <div className="filters">{leagues.map(l => <button key={l} className={league === l ? 'selected' : ''} onClick={() => setLeague(l)}>{l}</button>)}
            <button className={sort === 'prob' ? 'selected' : ''} onClick={() => setSort(sort === 'time' ? 'prob' : 'time')}>{sort === 'time' ? 'Ordina per probabilità' : 'Ordina per orario'}</button>
            <label className="builder-search"><Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca squadra" /></label></div>
          {shown.map((m, i) => <article key={m.fixtureId} className="panel builder-match">
            {(i === 0 || dayKey(shown[i - 1].kickoff) !== dayKey(m.kickoff)) && sort === 'time' && <p className="eyebrow builder-day">{dayKey(m.kickoff)}</p>}
            <div className="builder-match-head"><div><strong>{m.fixture}</strong><small>{m.competition} · {when(m.kickoff)}</small>{m.sc && <button className="combo-open" onClick={() => { setComboFor(m.fixtureId); document.getElementById('combo-maker')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>🧩 Crea una combo su questa partita</button>}</div>
              <LiveButton fixtureId={m.fixtureId} busy={live.busy} at={m.itAt} onClick={async () => { if (await live.refresh(m.fixtureId)) quietReload(); }} />
              <div className="builder-best">{m.opts.filter(o => m.best.has(o.market)).sort((a, b) => b.p - a.p).map(o => <span key={o.market}>★ {o.label} {percent(o.p, 0)} · {o.odds.toFixed(2)}</span>)}</div></div>
            {GROUPS.map(([g, keys]) => { const os = m.opts.filter(o => o.group === g).sort((x, y) => keys.indexOf(x.market) - keys.indexOf(y.market)); return os.length ? <div className="market-row" key={g}><span>{g}</span><div>{os.map(o => <span key={o.market} className={m.best.has(o.market) ? 'starred' : ''}>{chip(o)}</span>)}</div></div> : null; })}
            {m.opts.some(o => EXTRA.includes(o.group)) && <>
              <label className="mk-select"><span>Altri mercati</span><select value={(open as any)[m.fixtureId] || ''} onChange={e => setOpen({ ...open, [m.fixtureId]: e.target.value as any })}><option value="">Scegli un mercato…</option>{EXTRA.filter(g => m.opts.some(o => o.group === g)).map(g => <option key={g} value={g}>{g} ({m.opts.filter(o => o.group === g).length})</option>)}</select></label>
              {(open as any)[m.fixtureId] && EXTRA.filter(g => g === (open as any)[m.fixtureId]).map(g => { const os = m.opts.filter(o => o.group === g).sort((a, b) => g === 'Multigol' || g.startsWith('Combo') || g.startsWith('Under / Over') || g === 'Corner' || g === 'Cartellini' || g === 'Rigori' ? 0 : b.p - a.p).slice(0, g === 'Combo' ? 19 : g === 'Risultato esatto' ? 16 : g === 'Corner' || g === 'Cartellini' ? 16 : g === 'Marcatori' ? 28 : 12); return os.length ? <div className="market-row" key={g}><span>{g}</span><div>{os.map(o => <span key={o.market}>{chip(o, false)}<small className="chip-name">{o.label}</small></span>)}</div></div> : null; })}
            </>}
          </article>)}
          <p className="footnote">Percentuale = probabilità stimata da QUORUM (modello + mercato, corretta con il backtest). * = quota estera, l’esito non è quotato da Lottomatica / Planetwin365. ≈ = quota equa: il bookmaker non la manda. Nella schedina puoi correggere la quota di ogni evento con quella che hai giocato davvero: QUORUM ricalcola quota totale, valore, puntata e vincita. Le quote italiane si aggiornano ogni 12 ore: controlla sempre quella sul tuo conto.</p>
        </>}
    </div>
    <aside className={'panel builder-slip' + (slip.length ? ' has' : '') + (sheet ? ' open' : '')}>
      <button className="slip-grip" onClick={() => setSheet(!sheet)} aria-label={sheet ? 'Chiudi schedina' : 'Apri schedina'}><i /><span>{slip.length} {slip.length === 1 ? 'evento' : 'eventi'} · quota <b>{odds.toFixed(2)}</b>{rel ? ' · ' + pc(rel.p) : ''}</span><em>{sheet ? 'Chiudi' : 'Apri'}</em></button>
      <div className="slip-head"><h3>La tua schedina</h3><span>{slip.length} {slip.length === 1 ? 'evento' : 'eventi'}</span>{slip.length > 0 && <button className="icon-button" onClick={() => { setSlip([]); setStakeText(''); }} title="Svuota"><Trash2 size={16} /></button>}</div>
      {!slip.length ? <p className="small-note"><Plus size={14} /> Tocca una quota per aggiungerla. Un solo esito per partita.</p> : <>
        <ul className="slip-legs">{slip.map(l => <li key={l.fixtureId}><div><strong>{l.label}</strong><small>{l.fixture} · {when(l.kickoff)}</small></div><label className={'slip-odds' + (l.fair ? ' fair' : '')} title="Scrivi la quota che hai giocato"><small>{l.fair ? 'quota equa: scrivi la tua' : 'quota giocata'}</small><input key={l.market + l.odds} inputMode="decimal" defaultValue={l.odds.toFixed(2)} onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={e => { const v = Number(e.target.value.replace(',', '.')); if (v > 1 && v < 1000 && Math.abs(v - l.odds) > 1e-9) setSlip(slip.map(x => x.fixtureId === l.fixtureId && x.market === l.market ? { ...x, odds: v, value: x.p * v - 1, fair: false, bookmaker: 'quota inserita' } : x)); else e.target.value = l.odds.toFixed(2); }} /></label><button onClick={() => toggle(l)} title="Togli"><X size={14} /></button></li>)}</ul>
        {(() => { const n = new Set(slip.map(l => l.fixtureId)).size; return <div className="slip-live"><LiveButton fixtureId="slip" busy={liveBusy ? 'slip' : ''} at={liveAt} onClick={refreshSlip} /><small>{'Legge adesso Lottomatica/Planet per ' + (n === 1 ? 'questa partita' : 'queste ' + n + ' partite') + ': ' + n + (n === 1 ? ' aggiornamento' : ' aggiornamenti') + ' su 5 al giorno (gratis se già lette da meno di 15 minuti).'}</small></div>; })()}
        <div className="slip-total"><span>Quota totale</span><strong><Count value={odds} duration={500} format={v => v >= 1000 ? Math.round(v).toLocaleString('it-IT') : v.toFixed(2)} /></strong></div>
        {rel && <div className={'reliability r-' + verdict.replace(' ', '-')}><div><Ring p={rel.p} size={54} /><span>Affidabilità misurata</span><strong><Count value={rel.p} duration={500} format={pc} /></strong><em>{verdict} · {oneIn}</em></div>
          <small>Intervallo probabile {pc(rel.low)}–{pc(rel.high)}. Valore {ev >= 0 ? '+' : ''}{percent(ev, 0)}: {ev > 0 ? 'la quota paga più del rischio.' : 'la quota paga meno del rischio.'}</small></div>}
        <label className="slip-stake">Puntata (€)<input inputMode="decimal" value={stakeText} onChange={e => setStakeText(e.target.value)} placeholder={(suggested / 100).toFixed(2).replace('.', ',')} /></label>
        <p className={'stake-line ' + (ev > 0 ? 'go' : 'min')}>{ev > 0 ? 'Puntata consigliata ' + money(suggested) + ' (gestione del capitale).' : 'La quota non ripaga il rischio: se la giochi, punta il minimo (' + money(200) + ').'} Vincita potenziale: <b>{money(Math.round(stake * odds))}</b></p>
        {slip.some(l => !l.italian) && <p className="small-note">Alcuni esiti non sono quotati da Lottomatica / Planetwin365 (*): la quota reale può essere diversa.</p>}
        <label className="share-toggle"><input type="checkbox" checked={share} onChange={e => toggleShare(e.target.checked)} /><span>Condividi con gli altri utenti di QUORUM</span></label>
        <button className="lime-button slip-record" disabled={saving || !onRecord || stake < 100} onClick={async () => { if (!onRecord) return; setSaving(true); const ok = await onRecord(slip, stake, 'builder'); setSaving(false); if (ok) { setSlip([]); setStakeText(''); setSheet(false); notify(share ? 'Giocata registrata e condivisa: la vedono anche gli altri in Risultati.' : 'Giocata registrata: la trovi in Risultati, si regola da sola a fine partite.'); } }}><Check size={16} />{saving ? 'Registro…' : 'Registra la giocata'}</button>
        <div className="slip-actions"><button className="primary" onClick={copy}><Copy size={15} />Copia schedina</button><button className="secondary" onClick={() => onLab(slip.map(l => ({ fixtureId: l.fixtureId, fixture: l.fixture, market: l.market, label: l.label, p: l.p, odds: l.odds, competition: l.competition, kickoff: l.kickoff })))}><FlaskConical size={15} />Sistemi nel Laboratorio</button></div>
      </>}
    </aside>
  </div>;
}

// Picker used by the Laboratorio: any match of any competition, any market QUORUM offers.
export function LabPicker({ onAdd, taken }: { onAdd: (s: Selection) => void; taken: string[] }) {
  const [rows, setRows] = useState<Match[] | null>(null), [comp, setComp] = useState(''), [fid, setFid] = useState(''), [group, setGroup] = useState('Esito finale');
  useEffect(() => { fetch('/api/scanner?view=predictions', { cache: 'no-store' }).then(r => r.json()).then((d: any) => setRows((d.matches || []).map(toOptions).filter(Boolean)), () => setRows([])); }, []);
  if (!rows) return <p className="small-note">Carico le partite…</p>;
  const now = Date.now(), live = rows.filter(m => Date.parse(m.kickoff) > now);
  const comps = [...new Set(live.map(m => m.competition))];
  const list = live.filter(m => !comp || m.competition === comp).sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const m = list.find(x => x.fixtureId === fid);
  const groups = m ? [...GROUPS.map(g => g[0]), ...EXTRA].filter(g => m.opts.some(o => o.group === g)) : [];
  return <div className="lab-picker">
    <div className="lp-row"><label>Campionato<select value={comp} onChange={e => { setComp(e.target.value); setFid(''); }}><option value="">Tutti</option>{comps.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Partita<select value={fid} onChange={e => { setFid(e.target.value); setGroup('Esito finale'); }}><option value="">Scegli…</option>{list.map(x => <option key={x.fixtureId} value={x.fixtureId} disabled={taken.includes(x.fixtureId)}>{when(x.kickoff)} · {x.fixture}</option>)}</select></label></div>
    {m && <>
      <div className="archive-tabs">{groups.map(g => <button key={g} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>{g}</button>)}</div>
      <div className="chip-row">{m.opts.filter(o => o.group === group).sort((a, b) => group === 'Marcatori' || group.startsWith('Combo') || group === 'Risultato esatto' ? b.p - a.p : 0).map(o =>
        <button key={o.market} className="pick-chip" onClick={() => onAdd({ fixtureId: o.fixtureId, fixture: o.fixture, market: o.market, label: o.label, p: o.p, odds: o.odds, competition: o.competition, kickoff: o.kickoff })}>
          <span className="chip-label">{SHORT[o.market] ?? o.label}</span><b>{o.odds.toFixed(2)}{o.fair && <i title="Quota equa: correggila con la tua">≈</i>}</b><em>{percent(o.p, 0)}</em></button>)}</div>
      <p className="small-note">Tocca un esito per aggiungerlo. Nel Laboratorio puoi poi cambiare la quota di ogni partita con quella che hai trovato tu.</p>
    </>}
  </div>;
}

// "Costruisci la tua combo": the user picks the parts (result or double chance, goals, team goals, up to two
// scorers) and QUORUM computes the joint probability on the score matrix of the match. Scorers: given a score,
// the player scores with probability 1 − (1 − share)^goals of his team.
function ComboMaker({ matches, pick, setPick, onAdd }: { matches: Match[]; pick: string; setPick: (id: string) => void; onAdd: (o: Opt) => void }) {
  const list = matches.filter(m => m.sc && Date.parse(m.kickoff) > Date.now()).sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const m = list.find(x => x.fixtureId === pick) ?? null;
  const [res, setRes] = useState(''), [goal, setGoal] = useState(''), [ht, setHt] = useState(''), [s1, setS1] = useState(''), [s2, setS2] = useState(''), [odds, setOdds] = useState('');
  useEffect(() => { setRes(''); setGoal(''); setHt(''); setS1(''); setS2(''); setOdds(''); }, [pick]);
  const [home, away] = m ? m.fixture.split(' – ') : ['Casa', 'Ospite'];
  const players = (m?.players ?? []).slice().sort((a, b) => b.p - a.p);
  const chosen = [s1, s2].filter(Boolean).map(id => players.find(p => String(p.id) === id)).filter(Boolean) as Player[];
  const parts = [res, goal, ht].filter(Boolean), avail = comboAvailability(parts, chosen.length);
  const n = parts.length + chosen.length;
  const p = m?.sc && n >= 2 ? customComboP(m.sc, parts, chosen.map(pl => ({ side: pl.side, share: scorerShare(pl.p, pl.side === 'home' ? m.lh ?? 1.3 : m.la ?? 1.1) }))) : null;
  const typed = Number(odds.replace(',', '.')), fair = p ? 1 / p : 0;
  const label = [res, goal, ht, ...chosen.map(pl => 'segna ' + pl.name)].filter(Boolean).join(' + ');
  const add = () => { if (!m || !p) return; const o = typed > 1 ? typed : Math.round(fair * 100) / 100;
    onAdd({ fixtureId: m.fixtureId, fixture: m.fixture, competition: m.competition, kickoff: m.kickoff, market: 'combo:' + [...parts, ...chosen.map(pl => 'scorer=' + pl.id)].join(' + '), label: 'Combo: ' + label, group: 'Combo', p, odds: o, bookmaker: typed > 1 ? 'la tua quota' : 'quota equa', italian: false, fair: !(typed > 1), se: Math.sqrt(p * (1 - p) / 40), value: p * o - 1 }); };
  const sel = (v: string, set: (x: string) => void, opts: [string, string][], none: string) => <select value={v} onChange={e => set(e.target.value)}><option value="">{none}</option>{opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
  return <section className="panel combo-maker" id="combo-maker">
    <h3>🧩 Costruisci la tua combo</h3>
    <p className="small-note">Scegli una partita e almeno due condizioni: esito o doppia chance, Under / Over, Goal / No Goal, Multigol, Under / Over del 1° tempo, fino a due marcatori. QUORUM ti dice se la combo si gioca su Lottomatica / Planetwin365. QUORUM calcola la probabilità che si avverino <b>tutte insieme</b> e la quota equa. Poi scrivi la quota che vedi sul tuo bookmaker e aggiungila alla schedina.</p>
    <label className="cm-match"><span>Partita</span><select value={pick} onChange={e => setPick(e.target.value)}><option value="">Scegli la partita…</option>{list.map(x => <option key={x.fixtureId} value={x.fixtureId}>{x.fixture} · {when(x.kickoff)}</option>)}</select></label>
    {m && <>
      <div className="cm-quick"><small>Le più giocate, con un tocco:</small>{[['1', 'Over 1,5'], ['1X', 'Over 1,5'], ['X2', 'Over 1,5'], ['12', 'Over 1,5'], ['1', 'Goal'], ['2', 'Over 1,5'], ['1X', 'Under 3,5'], ['X2', 'Under 3,5'], ['1', 'Multigol 2-4'], ['12', 'Over 2,5']].map(([r, g]) => <button key={r + g} type="button" className={res === r && goal === g && !ht ? 'on' : ''} onClick={() => { setRes(r); setGoal(g); setHt(''); }}>{r} + {g}</button>)}</div>
      <div className="cm-grid">
        <label><span>Esito / doppia chance</span>{sel(res, setRes, RESULT_PARTS.map(r => [r, ({ '1': '1 · vince ' + home, X: 'X · pareggio', '2': '2 · vince ' + away, '1X': '1X · ' + home + ' non perde', X2: 'X2 · ' + away + ' non perde', '12': '12 · non finisce pari' } as Record<string, string>)[r]]), 'Nessuno')}</label>
        <label><span>Under / Over · Goal · Multigol <em>(partita intera)</em></span><select value={goal} onChange={e => setGoal(e.target.value)}><option value="">Nessuno</option>
          <optgroup label="Under / Over (90 minuti)">{GOAL_PARTS.filter(g => /^(Over|Under)/.test(g)).map(g => <option key={g} value={g}>{g}</option>)}</optgroup>
          <optgroup label="Goal / No Goal">{['Goal', 'No Goal'].map(g => <option key={g} value={g}>{g}</option>)}</optgroup>
          <optgroup label="Multigol (90 minuti)">{GOAL_PARTS.filter(g => g.startsWith('Multigol')).map(g => <option key={g} value={g}>{g}</option>)}</optgroup></select></label>
        <label><span>Solo 1° tempo <em>(Under / Over primi 45')</em></span>{sel(ht, setHt, HT_OU_PARTS.map(x => [x, x]), 'Nessuno')}</label>
        <label><span>Marcatore</span>{sel(s1, setS1, players.filter(pl => String(pl.id) !== s2).map(pl => [String(pl.id), pl.name + ' (' + (pl.side === 'home' ? home : away) + ') · ' + percent(pl.p, 0)]), players.length ? 'Nessuno' : 'Marcatori non disponibili')}</label>
        {s1 && <label><span>Secondo marcatore</span>{sel(s2, setS2, players.filter(pl => String(pl.id) !== s1).map(pl => [String(pl.id), pl.name + ' (' + (pl.side === 'home' ? home : away) + ') · ' + percent(pl.p, 0)]), 'Nessuno')}</label>}
      </div>
      {n < 2 ? <p className="small-note">Scegli almeno due condizioni.</p> : p !== null && <div className="cm-result">
        <div><span>La tua combo</span><b>{label}</b></div>
        <div className="cm-nums"><div><em>{percent(p, p < 0.1 ? 1 : 0)}</em><small>probabilità</small></div><div><em>{fair.toFixed(2)}</em><small>quota equa</small></div>
          <label><small>Quota del tuo bookmaker</small><input inputMode="decimal" value={odds} onChange={e => setOdds(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder={fair.toFixed(2)} /></label></div>
        {typed > 1 && <p className={'cm-verdict ' + (typed * p - 1 >= 0 ? 'ok' : 'ko')}>{typed * p - 1 >= 0 ? 'Valore +' + Math.round((typed * p - 1) * 100) + '%: la quota paga più del rischio.' : 'Valore ' + Math.round((typed * p - 1) * 100) + '%: la quota paga meno di quanto dovrebbe.'}</p>}
        <p className={'cm-avail ' + (avail ?? 'no')}>{avail === 'combo' ? '✅ Si gioca come Combo su Lottomatica / Planetwin365 (sezione Combo della partita).' : avail === 'super' ? '🧩 Si gioca solo con la Super Combo di Lottomatica / Planetwin365, disponibile sulle partite principali.' : '❌ Questa combinazione non è offerta da Lottomatica / Planetwin365. Le combo giocabili: esito + Under/Over, Goal/No Goal o Multigol; doppia chance + Under/Over, Goal/No Goal o Under/Over 1° tempo; con i marcatori, la Super Combo (esito, Under/Over, Goal/No Goal).'}</p>
        <button className="lime-button" onClick={add} disabled={!avail}><Plus size={16} />Aggiungi alla schedina</button>
        {ht && <p className="small-note">Multigol 1° tempo: gol segnati nei primi 45 minuti più recupero (circa il 45% dei gol di una partita arriva nel primo tempo).</p>}
        {chosen.length > 0 && <p className="small-note">Marcatori: rigori compresi, autogol esclusi. La probabilità del marcatore tiene conto dei gol che la sua squadra fa in quel risultato.</p>}
      </div>}
    </>}
  </section>;
}
