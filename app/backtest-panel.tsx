'use client';
import { useEffect, useState } from 'react';
import { BarChart3, Info } from 'lucide-react';

type K = { kind: string; title: string; group?: string; n: number; won: number; hit: number; expected: number; roi: number | null };
type B = { at: string; testDays: number; weeks: number; matches: number; byKind: K[]; series: { week: string; groups: Record<string, number> }[] } | null;
const GROUPS: [string, string][] = [['Raddoppi', '🛡️'], ['Multiple del giorno', '📋'], ['Schedine 3–5 squadre', '🎯'], ['Schemi settimanali', '🧩'], ['Sistemi del giorno', '🧮'], ['Bombe', '💣'], ['Risultati esatti e combo', '⚽']];

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  let acc = 0; const cum = values.map(v => (acc += v));
  const min = Math.min(0, ...cum), max = Math.max(0, ...cum), span = max - min || 1, W = 120, H = 34;
  const pt = (v: number, i: number) => (i / (cum.length - 1)) * W + ',' + (H - ((v - min) / span) * H);
  const zero = H - ((0 - min) / span) * H, up = cum[cum.length - 1] >= 0;
  return <svg className="bt-spark" viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="none"><line x1="0" x2={W} y1={zero} y2={zero} />
    <polyline className={up ? 'up' : 'down'} points={cum.map(pt).join(' ')} /></svg>;
}

export function WeeklyBacktest() {
  const [b, setB] = useState<B | undefined>(undefined);
  useEffect(() => { fetch('/api/scanner?view=backtest', { cache: 'no-store' }).then(r => r.json()).then((d: any) => setB(d.backtest ?? null), () => setB(null)); }, []);
  if (b === undefined) return null;
  if (!b) return <section className="bt-panel"><h2><BarChart3 size={20} />Backtest settimanale</h2><p className="small-note">Il primo backtest con le nuove schedine è in preparazione: si aggiorna da solo entro qualche ora.</p></section>;
  const groupOf = (k: K) => k.group || 'Altre';
  return <section className="bt-panel">
    <div className="bt-head"><h2><BarChart3 size={20} />Backtest settimanale</h2><small>Aggiornato il {new Date(b.at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} · {b.weeks} settimane · {b.matches.toLocaleString('it-IT')} partite</small></div>
    <p className="small-note">Ogni settimana QUORUM rigioca gli ultimi {b.testDays} giorni come se fosse in quel momento (solo dati di prima della partita), crea le stesse schedine e le chiude con i risultati veri e le quote reali di allora.</p>
    <div className="bt-grid">{GROUPS.map(([g, icon]) => {
      const ks = b.byKind.filter(k => groupOf(k) === g), n = ks.reduce((a, k) => a + k.n, 0);
      if (!n) return null;
      const won = ks.reduce((a, k) => a + k.won, 0), exp = ks.reduce((a, k) => a + k.expected * k.n, 0) / n, wr = ks.filter(k => k.roi !== null);
      const roi = wr.length ? wr.reduce((a, k) => a + (k.roi as number) * k.n, 0) / wr.reduce((a, k) => a + k.n, 0) : null;
      return <article key={g} className={'bt-card' + (roi === null ? '' : roi >= 0 ? ' pos' : ' neg')}>
        <div className="bt-title"><span>{icon}</span><b>{g}</b></div>
        <div className="bt-nums"><div><em>{Math.round(won / n * 100)}%</em><small>vinte ({won}/{n})</small></div><div><em>{Math.round(exp * 100)}%</em><small>previsto</small></div>
          {roi !== null ? <div><em className={roi >= 0 ? 'pos' : 'neg'}>{roi >= 0 ? '+' : ''}{Math.round(roi * 100)}%</em><small>rendimento</small></div> : <div><em>—</em><small>senza quote storiche</small></div>}</div>
        {roi !== null && <Spark values={b.series.map(s => s.groups[g] ?? 0)} />}
      </article>;
    })}</div>
    <p className="bt-foot"><Info size={13} />Rendimento = guadagno medio per euro giocato, con le quote medie dei bookmaker (le quote Lottomatica / Planetwin365 possono essere un po’ diverse). Se “vinte” è vicino a “previsto” le probabilità sono affidabili. Su meno di 50 giocate un rendimento positivo può essere fortuna.</p>
  </section>;
}
