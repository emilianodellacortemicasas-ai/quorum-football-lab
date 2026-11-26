'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { coverPlan, coverTickets, type CoverCand, type CoverLeg, type CoverOpt, type CoverTicket } from '../lib/cover';
import { money, percent } from '../lib/math';
import { toOptions, type Match, type Opt } from './builder';
import type { RecordPlay } from '../lib/types';

// Shown under every slip in Costruisci: the cover bet computed automatically, with the honest trade-off.
export function OppositeCover({ legs, stake, find, onRecordCover }: { legs: CoverLeg[]; stake: number; find: (f: string, m: string) => CoverOpt | null; onRecordCover?: (opt: CoverOpt & { fixture: string; kickoff?: string; competition?: string }, stake: number) => Promise<boolean> }) {
  const [mode, setMode] = useState<'full' | 'half'>('full'), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const c = coverPlan(legs, stake, find);
  const sign = (v: number) => (v > 0 ? '+' : '') + money(v);
  if (!c.cover) return <div className="cover-box"><h4><ShieldCheck size={16} />Copertura</h4><p className="small-note">{c.reason}</p></div>;
  const x = c.cover, part = c.partial!, st = mode === 'full' ? x.stake : part.stake;
  const ifAll = mode === 'full' ? x.ifAllWin : part.ifAllWin, ifLeg = mode === 'full' ? x.ifLegFails : part.ifLegFails, ev = mode === 'full' ? x.ev : part.ev;
  return <div className={'cover-box' + (x.pointless ? ' warn' : '')}>
    <h4><ShieldCheck size={16} />Opposto dell'evento più a rischio</h4>
    <p>L'evento più a rischio è <b>{x.leg.label}</b> ({x.leg.fixture}, {percent(x.leg.p, 0)}). Copertura: <b>{x.opt.label}</b> a <b>{x.opt.odds.toFixed(2)}</b>{x.opt.bookmaker ? ' su ' + x.opt.bookmaker : ''}.</p>
    <div className="cover-modes"><button className={mode === 'full' ? 'on' : ''} onClick={() => setMode('full')}>Recupera tutta la puntata · {money(x.stake)}</button><button className={mode === 'half' ? 'on' : ''} onClick={() => setMode('half')}>Metà · {money(part.stake)}</button></div>
    <table className="cover-table"><thead><tr><th></th><th>Senza copertura</th><th>Con copertura</th></tr></thead><tbody>
      <tr><td>Esce tutta la schedina</td><td>{sign(c.none.win - stake)}</td><td>{sign(ifAll)}</td></tr>
      <tr><td>Salta solo «{x.leg.label}»</td><td>{sign(-stake)}</td><td>{sign(ifLeg)}</td></tr>
      <tr><td>Salta un altro evento</td><td>{sign(-stake)}</td><td>{sign(-stake - st)}</td></tr>
      <tr><td>Probabilità di perdere tutto</td><td>{percent(c.none.pLoseAll, 0)}</td><td><b>{percent(x.pLoseAll, 0)}</b></td></tr>
      <tr><td>Risultato medio atteso</td><td>{sign(c.none.ev)}</td><td>{sign(ev)}</td></tr>
    </tbody></table>
    <p className="small-note">{x.pointless ? 'Su questa schedina la copertura si mangia tutta la vincita: non conviene. Ha senso sulle multiple con quota alta, non sulle singole.' : 'La copertura riduce molto la probabilità di perdere tutto, ma paga il margine del bookmaker una seconda volta: il risultato medio atteso scende di ' + money(Math.max(0, c.none.ev - ev)) + '. È un\'assicurazione, non un guadagno.'}</p>
    {onRecordCover && !x.pointless && <button className="secondary" disabled={busy || done || st < 100} onClick={async () => { setBusy(true); const ok = await onRecordCover({ ...x.opt, fixture: x.leg.fixture }, st); setBusy(false); if (ok) setDone(true); }}>{done ? 'Copertura registrata' : 'Registra anche la copertura (' + money(st) + ')'}</button>}
  </div>;
}

// One line under the slip in Costruisci: the effect of the cover, with the button to the Copertura section.
export function CoverHint({ legs, stake, find, cands, onOpen }: { legs: CoverLeg[]; stake: number; find: (f: string, m: string) => CoverOpt | null; cands?: CoverCand[]; onOpen: () => void }) {
  if (!legs.length) return null;
  const t = cands ? coverTickets(legs, stake, cands) : null, best = t?.options.slice().sort((a, b) => a.pLoseAll - b.pLoseAll)[0];
  if (best) return <button type="button" className="cover-hint" onClick={onOpen}><ShieldCheck size={16} /><span>Copertura: probabilità di perdere tutto {percent(t!.none.pLoseAll, 0)} → {percent(best.pLoseAll, 0)} con una seconda schedina</span><b>Apri Copertura</b></button>;
  const c = coverPlan(legs, stake, find);
  return <button type="button" className="cover-hint" onClick={onOpen}><ShieldCheck size={16} /><span>{c.cover ? (c.cover.pointless ? 'Copertura: su questa schedina non conviene' : 'Copertura: probabilità di perdere tutto ' + percent(c.none.pLoseAll, 0) + ' → ' + percent(c.cover.pLoseAll, 0)) : 'Copertura: nessun evento coperibile'}</span><b>Apri Copertura</b></button>;
}

// Standalone section "Copertura": the slip prepared in Costruisci (or in Valore di oggi), the stake, the cover.
const gid = () => Math.random().toString(36).slice(2, 10);
const asLeg = (l: CoverCand) => ({ fixtureId: l.fixtureId, fixture: l.fixture, competition: l.competition ?? '', kickoff: l.kickoff, market: l.market, label: l.label, p: l.p, odds: l.odds });
export function CoverView({ notify, onRecord, onBuilder, onToday, cap }: { notify: (m: string) => void; onRecord?: RecordPlay; onBuilder: () => void; onToday: () => void; cap?: number | null }) {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [slip, setSlip] = useState<Opt[]>(() => { try { return (JSON.parse(localStorage.getItem('quorum-slip-v1') || '[]') as Opt[]).filter(x => Date.parse(x.kickoff) > Date.now()); } catch { return []; } });
  const [stakeText, setStakeText] = useState(() => { try { const v = Number(localStorage.getItem('quorum-slip-stake')); return v >= 100 ? (v / 100).toFixed(2).replace('.', ',') : '2,00'; } catch { return '2,00'; } });
  useEffect(() => { fetch('/api/scanner?view=predictions', { cache: 'no-store' }).then(r => r.json()).then((d: any) => setMatches((d.matches || []).map(toOptions).filter(Boolean)), () => setMatches([])); }, []);
  const stake = Math.round(Number(stakeText.replace(',', '.')) * 100) || 0, odds = slip.reduce((s, l) => s * l.odds, 1);
  const find = (f: string, mk: string): CoverOpt | null => { const o = matches?.find(m => m.fixtureId === f)?.opts.find(x => x.market === mk); return o ? { fixtureId: f, market: mk, label: o.label, p: o.p, odds: o.odds, bookmaker: o.bookmaker } : null; };
  return <section className="cover-view">
    <div className="page-heading"><div><p className="eyebrow">COPERTURA</p><h1>Riduci il rischio della schedina<span>.</span></h1>
      <p>QUORUM ti propone una seconda schedina, su altre partite molto probabili o con valore, che se vince ti restituisce i soldi di tutte e due. Così perdi tutto solo se saltano entrambe.</p></div></div>
    <div className="section-switch"><button className="secondary" onClick={onBuilder}>Torna a Costruisci schedina</button><button className="text-button" onClick={onToday}>Valore di oggi</button></div>
    {!slip.length ? <div className="empty compact"><span className="empty-icon"><ShieldCheck /></span><h3>Nessuna schedina da coprire.</h3><p>Scegli le partite in Valore di oggi o in Costruisci: la copertura si calcola qui.</p>
      <div className="cover-links"><button className="primary" onClick={onToday}>Valore di oggi</button><button className="secondary" onClick={onBuilder}>Costruisci schedina</button></div></div>
    : <div className="cover-grid">
      <div className="panel"><h3>La tua schedina</h3><ul className="cover-legs">{slip.map(l => <li key={l.fixtureId}><div><b>{l.label}</b><span>{l.fixture}</span><em>{percent(l.p, 0)}</em></div><label className="cover-odds-l"><small>quota giocata</small><input className="cover-odds" inputMode="decimal" key={l.market + l.odds} defaultValue={l.odds.toFixed(2)} onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={e => { const v = Number(e.target.value.replace(',', '.')); if (v > 1 && v < 1000 && Math.abs(v - l.odds) > 1e-9) { const next = slip.map(x => x.fixtureId === l.fixtureId && x.market === l.market ? { ...x, odds: v, value: x.p * v - 1, fair: false, bookmaker: 'quota inserita' } : x); setSlip(next); try { localStorage.setItem('quorum-slip-v1', JSON.stringify(next)); } catch { } } else e.target.value = l.odds.toFixed(2); }} /></label></li>)}</ul>
        <p className="small-note">Se sul tuo conto la quota è diversa, correggila qui o sulla copertura: QUORUM ricalcola puntata e scenari.</p>
        <div className="slip-total"><span>Quota totale</span><strong>{odds.toFixed(2)}</strong></div>
        <label className="slip-stake">Puntata della schedina (€)<input inputMode="decimal" value={stakeText} onChange={e => setStakeText(e.target.value.replace(/[^0-9.,]/g, ''))} /></label>
        <button className="text-button" onClick={onBuilder}>Modifica la schedina in Costruisci</button></div>
      <div>{matches ? <CoverPanel legs={slip.map(l => ({ fixtureId: l.fixtureId, fixture: l.fixture, market: l.market, label: l.label, p: l.p, odds: l.odds }))} stake={stake} find={find} cands={candidatesFrom(matches)} cap={cap}
        onRecord={onRecord ? async (legs, st) => { const ok = await onRecord(legs.map(asLeg), st, 'builder', 'copertura-' + gid()); if (ok) notify('Copertura registrata. La trovi in Schedine coperte.'); return ok; } : undefined}
        onRecordPair={onRecord ? async (legs, st) => { const g = gid();
          const a = await onRecord(slip.map(l => ({ fixtureId: l.fixtureId, fixture: l.fixture, competition: l.competition || '', kickoff: l.kickoff, market: l.market, label: l.label, p: l.p, odds: l.odds })), stake, 'builder', 'coperta-' + g);
          if (!a) return false;
          const b = await onRecord(legs.map(asLeg), st, 'builder', 'copertura-' + g);
          if (!b) { notify('Schedina registrata, ma la copertura no: leggi il motivo e riprova con “salva solo la copertura”.'); return false; }
          try { localStorage.removeItem('quorum-slip-v1'); } catch { }
          notify('Schedina e copertura registrate insieme. Le trovi in Schedine coperte.'); return true; } : undefined} /> : <p>Calcolo della copertura…</p>}</div>
    </div>}
  </section>;
}

const BASIC = /^(home|draw|away|homeDraw|drawAway|homeAway|over\d+|under\d+|btts|noGoal)$/;
// Cover candidates: Lottomatica / Planet prices in the next 72 hours, very probable (≥ 60%) or with value (≥ 3%).
export function candidatesFrom(matches: Match[] | null): CoverCand[] {
  const t = Date.now();
  return (matches ?? []).filter(m => Date.parse(m.kickoff) > t + 10 * 60000 && Date.parse(m.kickoff) < t + 72 * 3600000).flatMap(m => m.opts
    .filter(o => BASIC.test(o.market) && o.bookmaker.startsWith('Lottomatica') && o.odds >= 1.15 && ((o.p >= 0.6) || (o.value >= 0.03 && o.p >= 0.4)))
    .sort((a, b) => b.p * (1 + Math.max(0, b.value)) - a.p * (1 + Math.max(0, a.value))).slice(0, 2)
    .map(o => ({ fixtureId: m.fixtureId, fixture: m.fixture, kickoff: m.kickoff, competition: m.competition, market: o.market, label: o.label, p: o.p, odds: o.odds, bookmaker: o.bookmaker, tag: o.value >= 0.03 ? 'valore' : undefined })));
}
const KIND: Record<CoverTicket['kind'], [string, string]> = {
  valore: ['Con valore', 'La quota paga più di quanto vale: la copertura alza anche il risultato medio.'],
  sicura: ['La più sicura', 'La probabilità di perdere tutto più bassa possibile.'],
  'valore-sicura': ['Con valore e la più sicura', 'Quota che paga più di quanto vale e la probabilità di perdere tutto più bassa.'],
  alternativa: ['Alternativa sicura', 'Altre partite molto probabili, se la prima non ti convince.'],
  economica: ['La più economica', 'Puntata più bassa che taglia comunque molto il rischio, come una X2 a quota alta.'],
};
const when2 = (s: string) => new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
// Main cover: a separate ticket on other matches that gives back the money of both tickets if it wins.
export function CoverPanel({ legs, stake, cands, find, onRecord, onRecordPair, cap }: { legs: CoverLeg[]; stake: number; cands: CoverCand[]; find: (f: string, m: string) => CoverOpt | null; onRecord?: (legs: CoverCand[], stake: number) => Promise<boolean>; onRecordPair?: (legs: CoverCand[], stake: number) => Promise<boolean>; cap?: number | null }) {
  const [done, setDone] = useState<Record<string, boolean>>({}), [busy, setBusy] = useState('');
  // Prices typed by the user (the real ones on the account) replace QUORUM's: stake and scenarios are recomputed.
  const [own, setOwn] = useState<Record<string, number>>({});
  const r = coverTickets(legs, stake, cands.map(c => own[c.fixtureId + ':' + c.market] ? { ...c, odds: own[c.fixtureId + ':' + c.market], tag: c.p * own[c.fixtureId + ':' + c.market] - 1 >= 0.03 ? 'valore' : undefined } : c));
  const sign = (v: number) => (v > 0 ? '+' : '') + money(v);
  const oddsIn = (l: CoverCand) => { const k = l.fixtureId + ':' + l.market; return <input className="cover-odds" inputMode="decimal" key={k + (own[k] ?? '')} defaultValue={l.odds.toFixed(2)} title="Scrivi la quota che vedi sul tuo conto" onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={e => { const v = Number(e.target.value.replace(',', '.')); if (v > 1 && v < 100 && Math.abs(v - l.odds) > 1e-9) setOwn(o => ({ ...o, [k]: v })); else e.target.value = l.odds.toFixed(2); }} />; };
  return <div className="cover-wrap">
    <div className="cover-intro"><b>Senza copertura</b> perdi tutto nel <b>{percent(r.none.pLoseAll, 0)}</b> dei casi. QUORUM cerca una seconda schedina su altre partite che, se vince, ti restituisce i soldi di tutte e due. Obiettivo: scendere sotto il {Math.round(r.target * 100)}%.</div>
    {!r.options.length && <p className="small-note">Nessuna giocata adatta nelle prossime 72 ore (servono esiti molto probabili o con valore su Lottomatica / Planet). Prova la copertura sull'evento più a rischio qui sotto.</p>}
    <div className="cover-options">{r.options.map(o => { const key = o.legs.map(l => l.fixtureId + l.market).join(); const ok = o.pLoseAll <= r.target;
      return <article key={key} className={'cover-opt ' + o.kind.split('-')[0]}>
        <header><b>{KIND[o.kind][0]}</b><span className={'cover-target' + (ok ? ' ok' : '')}>perdi tutto {percent(r.none.pLoseAll, 0)} → <b>{percent(o.pLoseAll, 0)}</b></span></header>
        <small>{KIND[o.kind][1]}</small>
        <ul>{o.legs.map(l => <li key={l.fixtureId}><div><b>{l.label}</b> {l.fixture}<em>{when2(l.kickoff)} · {percent(l.p, 0)}{l.tag === 'valore' ? ' · valore' : ''}{own[l.fixtureId + ':' + l.market] ? ' · quota tua' : ''}</em></div><label className="cover-odds-l"><small>quota</small>{oddsIn(l)}</label></li>)}</ul>
        <div className="cover-nums"><span>Quota <b>{o.odds.toFixed(2)}</b></span><span>Probabilità <b>{percent(o.p, 0)}</b></span><span>Puntata <b>{money(o.stake)}</b></span><span>Totale investito <b>{money(stake + o.stake)}</b></span></div>
        <table className="cover-table"><tbody>
          <tr><td>Vincono tutte e due</td><td>{sign(o.bothWin)}</td></tr>
          <tr><td>Vince solo la schedina</td><td>{sign(o.mainOnly)}</td></tr>
          <tr><td>Vince solo la copertura</td><td><b>{sign(o.coverOnly)}</b></td></tr>
          <tr><td>Perdono tutte e due</td><td>{sign(o.bothLose)}</td></tr>
          <tr><td>Risultato medio atteso</td><td>{sign(r.none.ev)} → {sign(o.ev)}</td></tr>
        </tbody></table>
        {cap && o.stake > cap ? <p className="cover-cap">Oltre la tua regola di capitale: massimo {money(cap)} a giocata. Abbassa la puntata della schedina o cambia regola nel Portafoglio.</p> : null}
        {onRecordPair && <button className="primary" disabled={!!busy || done[key] || o.stake < 100 || (!!cap && (o.stake > cap || stake > cap))} onClick={async () => { setBusy(key); const okk = await onRecordPair(o.legs, o.stake); setBusy(''); if (okk) setDone(d => ({ ...d, [key]: true })); }}>{done[key] ? 'Schedina e copertura registrate' : 'Registra schedina + copertura (' + money(stake) + ' + ' + money(o.stake) + ')'}</button>}
        {onRecord && !done[key] && <button className="text-button" disabled={!!busy || o.stake < 100 || (!!cap && o.stake > cap)} onClick={async () => { setBusy(key); const okk = await onRecord(o.legs, o.stake); setBusy(''); if (okk) setDone(d => ({ ...d, [key]: true })); }}>La schedina l’ho già registrata: salva solo la copertura</button>}
      </article>; })}</div>
    <details className="cover-more"><summary>Oppure: giocata opposta all'evento più a rischio</summary><OppositeCover legs={legs} stake={stake} find={find} /></details>
    <p className="small-note">Le probabilità sono stime di QUORUM. Si può perdere lo stesso: la copertura riduce il rischio, non lo elimina. Controlla le quote sul tuo conto prima di giocare.</p>
  </div>;
}

// "Schedine coperte": every main ticket registered with its cover, side by side, with the combined result.
export function CoveredView({ bets, onCover }: { bets: any[]; onCover: () => void }) {
  // Mine, or the ones shared by the other users (shown only if they ticked "Condividi").
  const [tab, setTab] = useState<'mine' | 'shared'>('mine'), [shared, setShared] = useState<any[] | null>(null);
  useEffect(() => { if (tab === 'shared' && !shared) fetch('/api/scanner?view=shared', { cache: 'no-store' }).then(r => r.json()).then((d: any) => setShared((d.plays ?? []).filter((x: any) => !x.mine && x.cover).map((x: any) => ({ id: x.id, author: x.author, source: ':' + x.cover.role + '-' + x.cover.group, marketLabel: x.legs.map((l: any) => l.label).join(' + '), fixture: x.legs.length > 1 ? x.legs.map((l: any) => l.fixture).join(' · ') : x.name, odds: x.odds, stakeCents: x.stakeCents, status: x.status, pnlCents: x.pnlCents, createdAt: x.createdAt }))), () => setShared([])); }, [tab, shared]);
  const src = tab === 'mine' ? bets : (shared ?? []);
  return <CoveredList bets={src} onCover={onCover} tab={tab} setTab={setTab} loading={tab === 'shared' && !shared} />;
}
function CoveredList({ bets, onCover, tab, setTab, loading }: { bets: any[]; onCover: () => void; tab: 'mine' | 'shared'; setTab: (t: 'mine' | 'shared') => void; loading: boolean }) {
  const groups = new Map<string, { main: any[]; cover: any[] }>();
  for (const b of bets) { const m = /:(coperta|copertura)-([a-z0-9]{4,12})/.exec(b.source ?? '') ?? (/:copertura$/.test(b.source ?? '') ? [, 'copertura', 'solo-' + b.id] as any : null); if (!m) continue; const g = groups.get(m[2]) ?? { main: [], cover: [] }; (m[1] === 'coperta' ? g.main : g.cover).push(b); groups.set(m[2], g); }
  const list = [...groups.entries()].map(([id, g]) => ({ id, ...g, at: [...g.main, ...g.cover].map(b => b.createdAt).sort()[0] })).sort((a, b) => b.at.localeCompare(a.at));
  const st = (b: any) => b.status === 'won' ? ['VINTA', 'green'] : b.status === 'lost' ? ['PERSA', 'red'] : b.status === 'void' ? ['ANNULLATA', 'neutral'] : ['IN CORSO', 'neutral'];
  const closed = list.filter(g => [...g.main, ...g.cover].every(b => b.status !== 'pending'));
  const tot = closed.reduce((t, g) => t + [...g.main, ...g.cover].reduce((s, b) => s + (b.pnlCents ?? 0), 0), 0);
  const saved = closed.filter(g => g.main.every(b => b.status === 'lost') && g.cover.some(b => b.status === 'won')).length;
  return <section className="covered">
    <div className="page-heading"><div><p className="eyebrow">SCHEDINE COPERTE</p><h1>Le tue schedine con copertura<span>.</span></h1><p>Ogni schedina accanto alla sua copertura, con il risultato delle due insieme.</p></div></div>
    <div className="archive-tabs sub-tabs"><button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>Le mie</button><button className={tab === 'shared' ? 'on' : ''} onClick={() => setTab('shared')}>Condivise dagli altri</button></div>
    <div className="section-switch"><button className="secondary" onClick={onCover}><ShieldCheck size={15} />Nuova copertura</button></div>
    {loading && <p>Caricamento…</p>}
    {closed.length > 0 && <div className="covered-sum"><span>Chiuse <b>{closed.length}</b></span><span>Salvate dalla copertura <b>{saved}</b></span><span>Risultato complessivo <b className={tot < 0 ? 'negative' : 'positive'}>{(tot > 0 ? '+' : '') + money(tot)}</b></span></div>}
    {!list.length && !loading && <div className="empty compact"><span className="empty-icon"><ShieldCheck /></span><h3>{tab === 'mine' ? 'Nessuna schedina coperta.' : 'Nessuna schedina coperta condivisa.'}</h3><p>{tab === 'mine' ? 'In Copertura premi “Registra schedina + copertura”: le due giocate compaiono qui insieme.' : 'Qui compaiono le schedine con copertura degli altri utenti che hanno attivato “Condividi con gli altri utenti di QUORUM”.'}</p></div>}
    <div className="covered-list">{list.map(g => { const all = [...g.main, ...g.cover], pnl = all.reduce((s, b) => s + (b.pnlCents ?? 0), 0), open = all.some(b => b.status === 'pending'), inv = all.reduce((s, b) => s + b.stakeCents, 0);
      return <article key={g.id} className="panel covered-card">
        <header>{all[0]?.author && tab === 'shared' && <b className="covered-author">{all[0].author}</b>}<small>{new Date(g.at).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small><span>Investito <b>{money(inv)}</b></span><b className={open ? '' : pnl < 0 ? 'negative' : 'positive'}>{open ? 'In corso' : (pnl > 0 ? '+' : '') + money(pnl)}</b></header>
        {[['Schedina', g.main], ['Copertura', g.cover]].map(([t, bs]: any) => <div key={t} className="covered-row"><span className="covered-tag">{t}</span>{bs.length ? bs.map((b: any) => { const [s, tone] = st(b); return <div key={b.id} className="covered-bet"><div><b>{b.marketLabel}</b><small>{b.fixture} · quota {Number(b.odds).toFixed(2)} · {money(b.stakeCents)}</small></div><span className={'tag ' + tone}>{s}</span></div>; }) : <small className="small-note">non registrata</small>}</div>)}
      </article>; })}</div>
  </section>;
}
