'use client';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { coverPlan, type CoverLeg, type CoverOpt } from '../lib/cover';
import { money, percent } from '../lib/math';

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
