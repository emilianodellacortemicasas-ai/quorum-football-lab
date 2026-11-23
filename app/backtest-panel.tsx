'use client';
import { useEffect, useState } from 'react';
import { BarChart3, Info } from 'lucide-react';

type K = { kind: string; title: string; group?: string; n: number; won: number; hit: number; expected: number; roi: number | null };
type M = { group: string; label: string; n: number; hit: number; expected: number; high: { n: number; hit: number; expected: number; roi: number | null } | null; mid: { n: number; hit: number; expected: number } | null };
type B = { at: string; testDays: number; weeks: number; matches: number; byKind: K[]; series: { week: string; groups: Record<string, number> }[]; markets?: M[] } | null;
const MGROUPS = ['Esito finale', 'Doppia chance', 'Under / Over', 'Goal / No Goal', 'Combo', 'Multigol', 'Risultato esatto'];
const pc = (x: number) => Math.round(x * 100) + '%';
function MarketBacktest({ markets, cup }: { markets: M[]; cup?: boolean }) {
  const [g, setG] = useState('Esito finale');
  const rows = markets.filter(m => m.group === g);
  const cell = (x: { n: number; hit: number; expected: number } | null) => !x || x.n < 20 ? <td className="mb-na">poche</td> : <td><b className={x.hit >= x.expected - 0.02 ? 'ok' : 'ko'}>{pc(x.hit)}</b><small> su {x.n} · prev. {pc(x.expected)}</small></td>;
  return <div className="mb">
    <h3><span>📊</span>{cup ? 'Coppe: backtest per mercato' : 'Backtest per mercato'}</h3>
    <p className="small-note">Per ogni giocata: quando QUORUM la dava al 60% o più (e tra 45% e 60%), quante volte è uscita davvero. Verde = uscita come previsto o più, rosso = meno. Il rendimento c’è solo dove abbiamo le quote storiche (1X2 e Under/Over 2,5).</p>
    <div className="archive-tabs">{MGROUPS.filter(x => markets.some(m => m.group === x)).map(x => <button key={x} className={g === x ? 'on' : ''} onClick={() => setG(x)}>{x}</button>)}</div>
    <div className="mb-wrap"><table className="mb-table"><thead><tr><th>Giocata</th><th>Data al 60% o più</th><th>Data al 45–60%</th><th>Rendimento</th></tr></thead>
      <tbody>{rows.map(m => <tr key={m.label}><td className="mb-l">{m.label}</td>{cell(m.high)}{cell(m.mid)}<td>{m.high?.roi === null || m.high?.roi === undefined ? '—' : <b className={m.high.roi >= 0 ? 'ok' : 'ko'}>{(m.high.roi >= 0 ? '+' : '') + Math.round(m.high.roi * 100)}%</b>}</td></tr>)}</tbody></table></div>
  </div>;
}
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

type CupB = { at: string; matches: number; considered: number; byComp: Record<string, number>; byKind: (K & { avgOdds: number })[]; markets: M[]; complete: boolean; progress: { planned: number; have: number } } | null;
export function CupBacktest() {
  const [b, setB] = useState<CupB | undefined>(undefined);
  useEffect(() => { fetch('/api/scanner?view=cup-backtest', { cache: 'no-store' }).then(r => r.json()).then((d: any) => setB(d.backtest ?? null), () => setB(null)); }, []);
  if (!b) return null;
  const order = ['raddoppio-coppe', 'singola-60', 'combo-55', 'multigol-65', 'esatto-top'];
  const ks = [...b.byKind].sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind));
  return <section className="bt-panel cup-bt">
    <div className="bt-head"><h2>🏆 Backtest Champions ed Europa League</h2><small>{b.matches} partite{Object.entries(b.byComp).map(([c, n]) => ' · ' + c + ' ' + n).join('')}{b.complete ? '' : ' · in completamento (' + b.progress.have + '/' + b.progress.planned + ' giornate)'}</small></div>
    <p className="small-note">Sulle coppe QUORUM non ha un modello delle squadre (vengono da campionati diversi): ricava i gol attesi dalle quote del mercato. Qui rigiochiamo ogni giornata di coppa degli ultimi 13 mesi con le quote reali di quel giorno e i risultati veri dei 90 minuti.</p>
    <div className="bt-grid">{ks.map(k => <article key={k.kind} className={'bt-card' + (k.roi === null ? '' : k.roi >= 0 ? ' pos' : ' neg')}>
      <div className="bt-title"><b>{k.title}</b></div>
      <div className="bt-nums"><div><em>{Math.round(k.hit * 100)}%</em><small>vinte ({k.won}/{k.n})</small></div><div><em>{Math.round(k.expected * 100)}%</em><small>previsto</small></div>
        {k.roi !== null ? <div><em className={k.roi >= 0 ? 'pos' : 'neg'}>{k.roi >= 0 ? '+' : ''}{Math.round(k.roi * 100)}%</em><small>rendimento · quota media {k.avgOdds.toFixed(2).replace('.', ',')}</small></div> : <div><em>—</em><small>senza quote storiche</small></div>}</div>
    </article>)}</div>
    {b.markets.length > 0 && <MarketBacktest markets={b.markets} cup />}
    <p className="bt-foot"><Info size={13} />Rendimento calcolato con la quota mediana dei bookmaker europei di quel giorno. Le quote italiane di solito sono un po’ più basse.</p>
  </section>;
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
    {b.markets && b.markets.length > 0 && <MarketBacktest markets={b.markets} />}
    <p className="bt-foot"><Info size={13} />Rendimento = guadagno medio per euro giocato, con le quote medie dei bookmaker (le quote Lottomatica / Planetwin365 possono essere un po’ diverse). Se “vinte” è vicino a “previsto” le probabilità sono affidabili. Su meno di 50 giocate un rendimento positivo può essere fortuna.</p>
  </section>;
}
