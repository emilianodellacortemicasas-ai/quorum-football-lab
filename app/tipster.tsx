'use client';
import { useEffect, useState } from 'react';
import { Check, Crosshair, Info, RefreshCw } from 'lucide-react';
import { money, percent } from '../lib/math';
import type { RecordPlay } from '../lib/types';

type L = { all?: Record<string, number>; fixtureId: string; fixture: string; competition: string; kickoff: string; market: string; label: string; odds: number; bookmaker: string; edge: number; pTrue: number; source: string; modelAgrees: boolean | null; stake: number };
type D = { legs: L[]; odds: number; p: number; edge: number; stake: number };
type Rec = { n: number; won: number; roi: number | null; clv: number | null; clvN: number; pending: number; recent: any[] };
type Study = { code: string; name: string; matches: number; margin: number; single: [number, number]; shop: [number, number]; clv: number | null };
type Data = { singles: L[]; doubles: D[]; record: Record<string, Rec>; study: Study[]; run: { finished_at: string } | null };
const when = (s: string) => new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const OURS = ['I1', 'E0', 'SP1', 'D1', 'F1', 'I2', 'E1'];

function RecordCard({ title, r }: { title: string; r?: Rec }) {
  if (!r || (!r.n && !r.pending)) return <article className="tip-rec"><b>{title}</b><p>Ancora nessuna giocata registrata: QUORUM le registra da solo da oggi.</p></article>;
  return <article className="tip-rec">
    <b>{title}</b>
    <div className="tip-rec-nums">
      <div><em>{r.n ? Math.round(r.won / r.n * 100) + '%' : '—'}</em><small>vinte ({r.won}/{r.n})</small></div>
      <div><em className={r.roi === null ? '' : r.roi >= 0 ? 'pos' : 'neg'}>{r.roi === null ? '—' : (r.roi >= 0 ? '+' : '') + Math.round(r.roi * 100) + '%'}</em><small>rendimento</small></div>
      <div><em className={r.clv === null ? '' : r.clv >= 0 ? 'pos' : 'neg'}>{r.clv === null ? '—' : (r.clv >= 0 ? '+' : '') + (r.clv * 100).toFixed(1) + '%'}</em><small>CLV ({r.clvN})</small></div>
    </div>
    <p>{r.pending} in attesa del risultato. {r.n < 100 ? 'Servono almeno 100 giocate chiuse perché il rendimento dica qualcosa: il CLV è affidabile molto prima.' : ''}</p>
  </article>;
}

export function TipsterView({ equityCents, onRecord }: { equityCents: number; onRecord?: RecordPlay }) {
  const [d, setD] = useState<Data | null>(null), [err, setErr] = useState('');
  useEffect(() => { fetch('/api/scanner?view=tipster', { cache: 'no-store' }).then(r => r.json()).then((x: any) => x.error ? setErr(x.error) : setD(x), () => setErr('Dati non disponibili.')); }, []);
  const stakeOf = (s: number) => Math.max(200, Math.round(equityCents * s / 50) * 50);
  const leg = (l: L) => ({ fixtureId: l.fixtureId, fixture: l.fixture, competition: l.competition, kickoff: l.kickoff, market: l.market, label: l.label, p: l.pTrue, odds: l.odds });
  return <div className="page tipster-page">
    <div className="page-head"><div><p className="eyebrow">IL METODO DEI PROFESSIONISTI</p><h1><Crosshair className="h1-icon" />Tipster</h1><p>Si gioca solo quando la quota italiana è più alta della probabilità vera. Poche giocate, singole e doppie, puntata proporzionata al valore.</p></div></div>
    <div className="tip-rules">
      {[['1', 'Quota più alta del giusto', 'Si gioca solo se un bookmaker italiano (Lottomatica / Planetwin365, Snai, Sisal, Eurobet) paga almeno il 3% in più della quota giusta. QUORUM ti dice dove.'],
        ['2', 'Probabilità vera = Pinnacle', 'La quota giusta viene dal bookmaker dei professionisti, senza il suo margine. Se manca, dalla media di tutti i bookmaker.'],
        ['3', 'Solo singole e doppie', 'Ogni partita in più moltiplica il margine del banco: niente multiple lunghe.'],
        ['4', 'Puntata in % del capitale', '¼ di Kelly: più valore = puntata più alta, mai oltre il 2% (1% per le doppie).']].map(([n, t, x]) => <div key={n} className="tip-rule"><span>{n}</span><b>{t}</b><small>{x}</small></div>)}
    </div>
    {err ? <div className="empty"><span className="empty-icon"><Info /></span><h3>Tipster non disponibile</h3><p>{err}</p></div>
      : !d ? <div className="empty"><span className="empty-icon"><RefreshCw className="spin" /></span><h3>Cerco le quote sbagliate…</h3></div>
      : <>
        <h3 className="day-title">📒 Il registro reale del metodo</h3>
        <p className="small-note">Ogni proposta viene registrata con la quota del momento e chiusa col risultato vero. Il <b>CLV</b> dice di quanto la quota presa batte la probabilità vera al calcio d’inizio: è il numero che i professionisti guardano per capire se hanno un vantaggio, perché si stabilizza dopo poche decine di giocate.</p>
        <div className="tip-rec-grid"><RecordCard title="Singole" r={d.record['tipster-singola']} /><RecordCard title="Doppie" r={d.record['tipster-doppia']} /></div>

        <h3 className="day-title">🎯 Singole di valore</h3>
        {!d.singles.length ? <p className="small-note">Oggi nessuna quota italiana supera la quota giusta di almeno il 3%. È normale: il metodo gioca poco. Nessuna giocata è meglio di una giocata senza valore.</p>
          : <div className="tip-list">{d.singles.map(l => <article key={l.fixtureId + l.market} className="tip-card">
            <div className="tip-top"><small>{l.competition} · {when(l.kickoff)}</small><span className="tip-edge">+{(l.edge * 100).toFixed(1)}%</span></div>
            <strong>{l.fixture}</strong>
            <div className="tip-pick"><b>{l.label}</b><span className="tip-odds">{l.odds.toFixed(2)}<small>{l.bookmaker}</small></span></div>
            {l.all && Object.keys(l.all).length > 1 && <div className="tip-books">{Object.entries(l.all).sort((a, b) => b[1] - a[1]).map(([b, o]) => <span key={b} className={o === l.odds ? 'best' : (l.pTrue * o - 1 >= 0.03 ? 'ok' : '')}>{b === 'Lottomatica' ? 'Lottomatica/Planetwin' : b}<b>{o.toFixed(2)}</b></span>)}</div>}
            <div className="tip-facts"><span>Probabilità vera <b>{percent(l.pTrue, 0)}</b><small>{l.source}</small></span><span>Quota giusta <b>{(1 / l.pTrue).toFixed(2)}</b></span><span>Puntata <b>{money(stakeOf(l.stake))}</b><small>{(l.stake * 100).toFixed(1)}% del capitale</small></span></div>
            {l.modelAgrees !== null && <p className={'tip-model ' + (l.modelAgrees ? 'ok' : 'no')}>{l.modelAgrees ? '✓ Anche il modello QUORUM la vede con valore' : '⚠ Il modello QUORUM non è d’accordo: puntata minima o salta'}</p>}
            {onRecord && <button className="secondary played-button" onClick={() => onRecord([leg(l)], stakeOf(l.stake), 'value', 'tipster-singola')}><Check size={15} />L’ho giocata ({money(stakeOf(l.stake))})</button>}
          </article>)}</div>}

        {d.doubles.length > 0 && <>
          <h3 className="day-title">✌️ Doppie di valore</h3>
          <p className="small-note">Due singole di valore insieme: il valore si moltiplica, ma vincono meno spesso. Puntata più bassa.</p>
          <div className="tip-list">{d.doubles.map(x => <article key={x.legs.map(l => l.fixtureId).join()} className="tip-card double">
            <div className="tip-top"><small>Doppia · quota {x.odds.toFixed(2)}</small><span className="tip-edge">+{(x.edge * 100).toFixed(1)}%</span></div>
            {x.legs.map(l => <div key={l.fixtureId} className="tip-leg"><span>{l.fixture}<small>{when(l.kickoff)}</small></span><b>{l.label} @ {l.odds.toFixed(2)}</b></div>)}
            <div className="tip-facts"><span>Probabilità vera <b>{percent(x.p, 0)}</b></span><span>Puntata <b>{money(stakeOf(x.stake))}</b></span></div>
            {onRecord && <button className="secondary played-button" onClick={() => onRecord(x.legs.map(leg), stakeOf(x.stake), 'value', 'tipster-doppia')}><Check size={15} />L’ho giocata ({money(stakeOf(x.stake))})</button>}
          </article>)}</div>
        </>}

        <h3 className="day-title">🔬 Dove i bookmaker sbagliano di più</h3>
        <p className="small-note">Studio su 4 stagioni e oltre 20.000 partite: quante volte un bookmaker “normale” (Bet365, simile ai nostri) ha pagato più della quota giusta di Pinnacle, e con che risultato. <b>CLV</b> positivo = quelle quote erano davvero sbagliate.</p>
        <div className="standings-card"><table className="standings study">
          <thead><tr><th className="t-team">Campionato</th><th>Occasioni a stagione</th><th className="hide-sm">Con più bookmaker</th><th>CLV</th><th className="hide-sm">Margine</th></tr></thead>
          <tbody>{[...d.study].sort((a, b) => b.single[0] - a.single[0]).map(s => <tr key={s.code} className={OURS.includes(s.code) ? 'ours' : ''}>
            <td className="t-team"><span>{s.name}</span>{OURS.includes(s.code) && <em className="ours-tag">in QUORUM</em>}</td>
            <td><b>{Math.round(s.single[0] / 4)}</b></td><td className="hide-sm">{Math.round(s.shop[0] / 4)}</td>
            <td className={s.clv === null ? '' : s.clv > 0.015 ? 'clv-pos' : s.clv < 0 ? 'clv-neg' : ''}>{s.clv === null ? '—' : (s.clv > 0 ? '+' : '') + (s.clv * 100).toFixed(1) + '%'}</td>
            <td className="hide-sm">{(s.margin * 100).toFixed(1)}%</td></tr>)}</tbody>
        </table>
          <p className="legend-zones"><span>Con un solo bookmaker le occasioni sono poche; confrontando più bookmaker diventano 3–5 volte tante. Il rendimento su poche decine di giocate è rumore: per decidere conta il CLV.</span></p></div>
      </>}
  </div>;
}
