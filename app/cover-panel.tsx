'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { coverPlan, type CoverLeg, type CoverOpt } from '../lib/cover';
import { money, percent } from '../lib/math';
import { toOptions, type Match, type Opt } from './builder';
import type { RecordPlay } from '../lib/types';

// Shown under every slip in Costruisci: the cover bet computed automatically, with the honest trade-off.
export function CoverPanel({ legs, stake, find, onRecordCover }: { legs: CoverLeg[]; stake: number; find: (f: string, m: string) => CoverOpt | null; onRecordCover?: (opt: CoverOpt & { fixture: string; kickoff?: string; competition?: string }, stake: number) => Promise<boolean> }) {
  const [mode, setMode] = useState<'full' | 'half'>('full'), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const c = coverPlan(legs, stake, find);
  const sign = (v: number) => (v > 0 ? '+' : '') + money(v);
  if (!c.cover) return <div className="cover-box"><h4><ShieldCheck size={16} />Copertura</h4><p className="small-note">{c.reason}</p></div>;
  const x = c.cover, part = c.partial!, st = mode === 'full' ? x.stake : part.stake;
  const ifAll = mode === 'full' ? x.ifAllWin : part.ifAllWin, ifLeg = mode === 'full' ? x.ifLegFails : part.ifLegFails, ev = mode === 'full' ? x.ev : part.ev;
  return <div className={'cover-box' + (x.pointless ? ' warn' : '')}>
    <h4><ShieldCheck size={16} />Copertura consigliata</h4>
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
export function CoverHint({ legs, stake, find, onOpen }: { legs: CoverLeg[]; stake: number; find: (f: string, m: string) => CoverOpt | null; onOpen: () => void }) {
  if (!legs.length) return null;
  const c = coverPlan(legs, stake, find);
  return <button type="button" className="cover-hint" onClick={onOpen}><ShieldCheck size={16} /><span>{c.cover ? (c.cover.pointless ? 'Copertura: su questa schedina non conviene' : 'Copertura: probabilità di perdere tutto ' + percent(c.none.pLoseAll, 0) + ' → ' + percent(c.cover.pLoseAll, 0)) : 'Copertura: nessun evento coperibile'}</span><b>Apri Copertura</b></button>;
}

// Standalone section "Copertura": the slip prepared in Costruisci (or in Valore di oggi), the stake, the cover.
export function CoverView({ notify, onRecord, onBuilder, onToday }: { notify: (m: string) => void; onRecord?: RecordPlay; onBuilder: () => void; onToday: () => void }) {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [slip] = useState<Opt[]>(() => { try { return (JSON.parse(localStorage.getItem('quorum-slip-v1') || '[]') as Opt[]).filter(x => Date.parse(x.kickoff) > Date.now()); } catch { return []; } });
  const [stakeText, setStakeText] = useState(() => { try { const v = Number(localStorage.getItem('quorum-slip-stake')); return v >= 100 ? (v / 100).toFixed(2).replace('.', ',') : '2,00'; } catch { return '2,00'; } });
  useEffect(() => { fetch('/api/scanner?view=predictions', { cache: 'no-store' }).then(r => r.json()).then((d: any) => setMatches((d.matches || []).map(toOptions).filter(Boolean)), () => setMatches([])); }, []);
  const stake = Math.round(Number(stakeText.replace(',', '.')) * 100) || 0, odds = slip.reduce((s, l) => s * l.odds, 1);
  const find = (f: string, mk: string): CoverOpt | null => { const o = matches?.find(m => m.fixtureId === f)?.opts.find(x => x.market === mk); return o ? { fixtureId: f, market: mk, label: o.label, p: o.p, odds: o.odds, bookmaker: o.bookmaker } : null; };
  return <section className="cover-view">
    <div className="page-heading"><div><p className="eyebrow">COPERTURA</p><h1>Riduci il rischio della schedina<span>.</span></h1>
      <p>QUORUM trova l’evento più a rischio della tua schedina e calcola la giocata opposta che ti restituisce la puntata se salta proprio quello. È un’assicurazione: riduce la probabilità di perdere tutto, ma costa un po’ di rendimento medio.</p></div></div>
    {!slip.length ? <div className="empty compact"><span className="empty-icon"><ShieldCheck /></span><h3>Nessuna schedina da coprire.</h3><p>Scegli le partite in Valore di oggi o in Costruisci: la copertura si calcola qui.</p>
      <div className="cover-links"><button className="primary" onClick={onToday}>Valore di oggi</button><button className="secondary" onClick={onBuilder}>Costruisci schedina</button></div></div>
    : <div className="cover-grid">
      <div className="panel"><h3>La tua schedina</h3><ul className="cover-legs">{slip.map(l => <li key={l.fixtureId}><b>{l.label}</b><span>{l.fixture}</span><em>{percent(l.p, 0)} · {l.odds.toFixed(2)}</em></li>)}</ul>
        <div className="slip-total"><span>Quota totale</span><strong>{odds.toFixed(2)}</strong></div>
        <label className="slip-stake">Puntata della schedina (€)<input inputMode="decimal" value={stakeText} onChange={e => setStakeText(e.target.value.replace(/[^0-9.,]/g, ''))} /></label>
        <button className="text-button" onClick={onBuilder}>Modifica la schedina in Costruisci</button></div>
      <div>{matches ? <CoverPanel legs={slip.map(l => ({ fixtureId: l.fixtureId, fixture: l.fixture, market: l.market, label: l.label, p: l.p, odds: l.odds }))} stake={stake} find={find}
        onRecordCover={onRecord ? async (o, st) => { const leg = slip.find(l => l.fixtureId === o.fixtureId)!; const ok = await onRecord([{ ...leg, market: o.market, label: o.label, p: o.p, odds: o.odds }], st, 'builder', 'copertura'); notify(ok ? 'Copertura registrata come giocata separata.' : 'Copertura non registrata.'); return ok; } : undefined} /> : <p>Calcolo della copertura…</p>}</div>
    </div>}
  </section>;
}
