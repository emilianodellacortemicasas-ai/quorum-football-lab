'use client';
// "Costruisci la tua schedina": every match of the week, market by market, with the playable price
// (Lottomatica / Planetwin365 when available), the most probable outcomes and the value ones highlighted.
// The user builds a free ticket of any size; QUORUM measures it (reliability, value, stake, potential win).
import { useEffect, useMemo, useState } from 'react';
import { Copy, FlaskConical, Info, Plus, RefreshCw, Search, Star, Trash2, X } from 'lucide-react';
import { marketLabel, money, percent } from '../lib/math';
import { ticketReliability } from '../lib/calibration';
import type { Selection } from '../lib/types';
import { Count, Ring } from './motion';

type Opt = { fixtureId: string; fixture: string; competition: string; kickoff: string; market: string; label: string; group: string; p: number; odds: number; bookmaker: string; italian: boolean; se: number; value: number };
type Match = { fixtureId: string; fixture: string; competition: string; kickoff: string; opts: Opt[]; best: Set<string> };

const GROUPS: [string, string[]][] = [
  ['Esito finale', ['home', 'draw', 'away']],
  ['Doppia chance', ['homeDraw', 'drawAway', 'homeAway']],
  ['Gol', ['over15', 'under15', 'over25', 'under25', 'over35', 'under35']],
  ['Goal / No Goal', ['btts', 'noGoal']],
];
const SHORT: Record<string, string> = { home: '1', draw: 'X', away: '2', homeDraw: '1X', drawAway: 'X2', homeAway: '12', over15: 'Over 1,5', under15: 'Under 1,5', over25: 'Over 2,5', under25: 'Under 2,5', over35: 'Over 3,5', under35: 'Under 3,5', btts: 'Goal', noGoal: 'No Goal' };
const when = (s: string) => new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const dayKey = (s: string) => new Date(s).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' });
const pc = (p: number) => percent(p, p < 0.1 ? 1 : 0);
const SLIP_KEY = 'quorum-slip-v1';

function toOptions(r: any): Match | null {
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
  if (!opts.length) return null;
  // Highlight: the two most probable outcomes with a real price (≥ 1,10) among the markets measured by the backtest.
  const measured = new Set(GROUPS.flatMap(g => g[1]));
  const best = new Set(opts.filter(o => o.odds >= 1.1 && measured.has(o.market)).sort((a, b) => b.p - a.p).slice(0, 2).map(o => o.market));
  return { fixtureId: r.fixture_id, fixture: r.fixture, competition: r.competition, kickoff: r.kickoff, opts, best };
}

export function BuilderView({ equityCents, onLab, notify }: { equityCents: number; onLab: (s: Selection[]) => void; notify: (m: string) => void }) {
  const [matches, setMatches] = useState<Match[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [slip, setSlip] = useState<Opt[]>([]), [league, setLeague] = useState('Tutte'), [q, setQ] = useState(''), [sort, setSort] = useState<'time' | 'prob'>('time');
  const [open, setOpen] = useState<Record<string, boolean>>({}), [stakeText, setStakeText] = useState('');
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(SLIP_KEY) || '[]'); if (Array.isArray(s)) setSlip(s.filter((x: Opt) => Date.parse(x.kickoff) > Date.now())); } catch { } }, []);
  useEffect(() => { try { localStorage.setItem(SLIP_KEY, JSON.stringify(slip)); } catch { } }, [slip]);
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
  const kelly = ev > 0 ? Math.min(0.02, (ev / (odds - 1)) * 0.25) : 0, suggested = Math.max(200, Math.floor(equityCents * kelly / 100) * 100);
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
    <b>{o.odds.toFixed(2)}{!o.italian && <i title="Quota estera: non quotata da Lottomatica / Planetwin365">*</i>}</b>
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
          <div className="filters">{leagues.map(l => <button key={l} className={league === l ? 'selected' : ''} onClick={() => setLeague(l)}>{l}</button>)}
            <button className={sort === 'prob' ? 'selected' : ''} onClick={() => setSort(sort === 'time' ? 'prob' : 'time')}>{sort === 'time' ? 'Ordina per probabilità' : 'Ordina per orario'}</button>
            <label className="builder-search"><Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca squadra" /></label></div>
          {shown.map((m, i) => <article key={m.fixtureId} className="panel builder-match">
            {(i === 0 || dayKey(shown[i - 1].kickoff) !== dayKey(m.kickoff)) && sort === 'time' && <p className="eyebrow builder-day">{dayKey(m.kickoff)}</p>}
            <div className="builder-match-head"><div><strong>{m.fixture}</strong><small>{m.competition} · {when(m.kickoff)}</small></div>
              <div className="builder-best">{m.opts.filter(o => m.best.has(o.market)).sort((a, b) => b.p - a.p).map(o => <span key={o.market}>★ {o.label} {percent(o.p, 0)} · {o.odds.toFixed(2)}</span>)}</div></div>
            {GROUPS.map(([g]) => { const os = m.opts.filter(o => o.group === g); return os.length ? <div className="market-row" key={g}><span>{g}</span><div>{os.map(o => <span key={o.market} className={m.best.has(o.market) ? 'starred' : ''}>{chip(o)}</span>)}</div></div> : null; })}
            {m.opts.some(o => o.group === 'Corner e cartellini' || o.group === 'Marcatori') && <>
              <button className="text-button" onClick={() => setOpen({ ...open, [m.fixtureId]: !open[m.fixtureId] })}>{open[m.fixtureId] ? 'Nascondi' : 'Altri mercati'}: corner, cartellini, marcatori</button>
              {open[m.fixtureId] && ['Corner e cartellini', 'Marcatori'].map(g => { const os = m.opts.filter(o => o.group === g).sort((a, b) => b.p - a.p).slice(0, 12); return os.length ? <div className="market-row" key={g}><span>{g}</span><div>{os.map(o => <span key={o.market}>{chip(o, false)}<small className="chip-name">{o.label}</small></span>)}</div></div> : null; })}
            </>}
          </article>)}
          <p className="footnote">Percentuale = probabilità stimata da QUORUM (modello + mercato, corretta con il backtest). * = quota estera, l’esito non è quotato da Lottomatica / Planetwin365. Le quote italiane si aggiornano ogni 12 ore: controlla sempre quella sul tuo conto.</p>
        </>}
    </div>
    <aside className={'panel builder-slip' + (slip.length ? ' has' : '')}>
      <div className="slip-head"><h3>La tua schedina</h3><span>{slip.length} {slip.length === 1 ? 'evento' : 'eventi'}</span>{slip.length > 0 && <button className="icon-button" onClick={() => { setSlip([]); setStakeText(''); }} title="Svuota"><Trash2 size={16} /></button>}</div>
      {!slip.length ? <p className="small-note"><Plus size={14} /> Tocca una quota per aggiungerla. Un solo esito per partita.</p> : <>
        <ul className="slip-legs">{slip.map(l => <li key={l.fixtureId}><div><strong>{l.label}</strong><small>{l.fixture} · {when(l.kickoff)}</small></div><b>{l.odds.toFixed(2)}</b><button onClick={() => toggle(l)} title="Togli"><X size={14} /></button></li>)}</ul>
        <div className="slip-total"><span>Quota totale</span><strong><Count value={odds} duration={500} format={v => v >= 1000 ? Math.round(v).toLocaleString('it-IT') : v.toFixed(2)} /></strong></div>
        {rel && <div className={'reliability r-' + verdict.replace(' ', '-')}><div><Ring p={rel.p} size={54} /><span>Affidabilità misurata</span><strong><Count value={rel.p} duration={500} format={pc} /></strong><em>{verdict} · {oneIn}</em></div>
          <small>Intervallo probabile {pc(rel.low)}–{pc(rel.high)}. Valore {ev >= 0 ? '+' : ''}{percent(ev, 0)}: {ev > 0 ? 'la quota paga più del rischio.' : 'la quota paga meno del rischio.'}</small></div>}
        <label className="slip-stake">Puntata (€)<input inputMode="decimal" value={stakeText} onChange={e => setStakeText(e.target.value)} placeholder={(suggested / 100).toFixed(2).replace('.', ',')} /></label>
        <p className={'stake-line ' + (ev > 0 ? 'go' : 'min')}>{ev > 0 ? 'Puntata consigliata ' + money(suggested) + ' (gestione del capitale).' : 'La quota non ripaga il rischio: se la giochi, punta il minimo (' + money(200) + ').'} Vincita potenziale: <b>{money(Math.round(stake * odds))}</b></p>
        {slip.some(l => !l.italian) && <p className="small-note">Alcuni esiti non sono quotati da Lottomatica / Planetwin365 (*): la quota reale può essere diversa.</p>}
        <div className="slip-actions"><button className="primary" onClick={copy}><Copy size={15} />Copia schedina</button><button className="secondary" onClick={() => onLab(slip.map(l => ({ fixtureId: l.fixtureId, fixture: l.fixture, market: l.market, label: l.label, p: l.p, odds: l.odds })))}><FlaskConical size={15} />Sistemi nel Laboratorio</button></div>
      </>}
    </aside>
  </div>;
}
