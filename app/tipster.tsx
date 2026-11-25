'use client';
import { useEffect, useState } from 'react';
import { Check, Crosshair, Info, RefreshCw } from 'lucide-react';
import { money, percent } from '../lib/math';
import type { RecordPlay } from '../lib/types';
import { DayFilter, useDay } from './day-filter';

type L = { all?: Record<string, number>; ageH?: number | null; fixtureId: string; fixture: string; competition: string; kickoff: string; market: string; label: string; odds: number; bookmaker: string; edge: number; pTrue: number; source: string; modelAgrees: boolean | null; stake: number };
type D = { legs: L[]; odds: number; p: number; edge: number; stake: number };
type Rec = { n: number; won: number; roi: number | null; clv: number | null; clvN: number; pending: number; recent: any[] };
type Study = { code: string; name: string; matches: number; margin: number; single: [number, number]; shop: [number, number]; clv: number | null };
type Near = { fixture: string; competition: string; kickoff: string; label: string; odds: number; bookmaker: string; fair: number; edge: number; source: string };
type Data = { compared?: number; matches?: number; near?: Near[]; days?: { day: string; n: number }[]; singles: L[]; doubles: D[]; record: Record<string, Rec>; study: Study[]; run: { finished_at: string } | null };
const when = (s: string) => new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const OURS = ['I1', 'E0', 'SP1', 'D1', 'F1', 'I2', 'E1'];

// Explanation of the record, the CLV and the study behind the method. Figures of the study: lib/league-study-data.ts
// (football-data.co.uk, 2022/23–2025/26), aggregated on QUORUM's 7 leagues.
export function RecordInfo({ study }: { study: Study[] }) {
  const ours = study.filter(s => OURS.includes(s.code));
  const sum = (f: (s: Study) => number) => ours.reduce((a, s) => a + f(s), 0);
  const nS = sum(s => s.single[0]), roiS = nS ? sum(s => s.single[0] * s.single[1]) / nS : 0;
  const nH = sum(s => s.shop[0]), roiH = nH ? sum(s => s.shop[0] * s.shop[1]) / nH : 0;
  const wC = ours.filter(s => s.clv !== null), clv = wC.length ? wC.reduce((a, s) => a + (s.clv as number) * s.single[0], 0) / Math.max(1, wC.reduce((a, s) => a + s.single[0], 0)) : 0;
  const posC = wC.filter(s => (s.clv as number) > 0).length, matches = sum(s => s.matches);
  const sg = (x: number, d = 1) => (x >= 0 ? '+' : '') + (x * 100).toFixed(d).replace('.', ',') + '%';
  return <div className="rec-info">
    <h4>I due riquadri: Singole e Doppie</h4>
    <ul>
      <li><b>Singole</b> = le giocate su <b>un solo evento</b> proposte dal Tipster (es. “Over 2,5” a 2,10 su Lottomatica).</li>
      <li><b>Doppie</b> = <b>due eventi</b> di partite diverse nella stessa schedina: si vince solo se escono entrambi. La quota si moltiplica (2,00 × 1,90 = 3,80), ma anche il margine del bookmaker: per questo il Tipster si ferma a due.</li>
      <li>Ogni riquadro conta solo le sue giocate. Ogni proposta viene salvata <b>prima della partita</b>, con la quota di quel momento, e chiusa da sola col risultato vero: niente si può aggiustare dopo.</li>
    </ul>
    <h4>Come si calcolano i tre numeri</h4>
    <ul>
      <li><b>Vinte</b> = giocate vinte ÷ giocate chiuse (le rimborsate non contano).</li>
      <li><b>Rendimento</b> = quanto guadagni per ogni euro giocato, puntando 1 € su ogni proposta alla quota registrata. Esempio: 10 giocate, 6 vinte a 2,00 → incassi 12 €, giochi 10 € → <b>+20%</b>.</li>
      <li><b>CLV</b> (Closing Line Value, “valore sulla quota di chiusura”) = <b>probabilità vera al calcio d’inizio × quota presa − 1</b>. La probabilità vera di chiusura è la quota di Pinnacle senza margine all’ultima scansione prima della partita (se Pinnacle manca, la media del mercato). Esempio: prendi 2,10; al fischio d’inizio Pinnacle dice che l’evento ha il 50% → 0,50 × 2,10 − 1 = <b>+5%</b>. Hai comprato un biglietto che vale 2,00 a 2,10. Per le doppie: le due probabilità di chiusura moltiplicate × quota della doppia − 1. Tra parentesi c’è quante giocate sono già state misurate.</li>
    </ul>
    <h4>Perché il CLV conta più del rendimento</h4>
    <ul>
      <li>Il rendimento dipende dalla fortuna dei risultati. A quota 2,00, dopo 50 giocate può oscillare di circa <b>±28%</b> anche con un metodo perfettamente neutro; servono centinaia di giocate per capire se è bravura.</li>
      <li>Il CLV non guarda il risultato: guarda il <b>prezzo</b>. La quota di chiusura di Pinnacle è la stima più precisa che esista (ci scommettono i professionisti con limiti altissimi). Chi la batte con regolarità guadagna nel lungo periodo: è il primo numero che controllano i tipster professionisti e le stesse case di scommesse, che limitano proprio i conti con CLV positivo.</li>
      <li>Regola pratica: <b>CLV positivo su 50–100 giocate</b> = il metodo trova quote sbagliate davvero. CLV negativo = stai pagando troppo, anche se per ora vinci.</li>
    </ul>
    <h4>Perché questa sezione ha valore: il backtest</h4>
    <ul>
      <li>Abbiamo rigiocato <b>4 stagioni (2022/23–2025/26)</b> dei nostri 7 campionati, <b>{matches.toLocaleString('it-IT')} partite</b>, con le quote vere di allora (football-data.co.uk). Al posto dei bookmaker italiani (di cui non esiste uno storico pubblico) abbiamo usato Bet365, un bookmaker “morbido” con margine di circa 5,5% sull’1X2, simile o un po’ più basso di quello italiano.</li>
      <li><b>Bet365 almeno 2% sopra la quota giusta di Pinnacle</b>: {nS} giocate, rendimento <b>{sg(roiS)}</b> e CLV medio <b>{sg(clv)}</b>, positivo in {posC} campionati su {wC.length}. Tradotto: anche un bookmaker “morbido” ogni tanto sbaglia prezzo, e quei prezzi battono la chiusura.</li>
      <li><b>La quota migliore tra tutti i bookmaker</b>, almeno 3% sopra la giusta: {nH.toLocaleString('it-IT')} giocate, rendimento <b>{sg(roiH)}</b>. È il motivo per cui il Tipster confronta 4 bookmaker italiani e ti dice dove giocare: più bookmaker confronti, più quote sbagliate trovi.</li>
      <li>Lo stesso studio dice anche dove <b>non</b> giocare: giocando sempre gli esiti più probabili, senza guardare il prezzo, si perde (nel backtest delle coppe −3% a quota mediana). Senza quota sbagliata non c’è vantaggio.</li>
      <li><b>Onestà</b>: Bet365 non è Lottomatica, il campione delle singole è piccolo e la “quota migliore” storica è ottimistica (non sempre giocabile). Per questo il numero che conta è il <b>registro reale</b> qui sotto, che si riempie da solo giorno dopo giorno. La tabella completa dello studio è più in basso.</li>
    </ul>
  </div>;
}

function RecordCard({ title, r }: { title: string; r?: Rec }) {
  if (!r || (!r.n && !r.pending)) return <article className="tip-rec"><b>{title}</b><p>Ancora nessuna giocata registrata: QUORUM le registra da solo da oggi.</p></article>;
  return <article className="tip-rec">
    <b>{title}</b>
    <div className="tip-rec-nums">
      <div><em>{r.n ? Math.round(r.won / r.n * 100) + '%' : '—'}</em><small>vinte ({r.won}/{r.n})</small></div>
      <div><em className={r.roi === null ? '' : r.roi >= 0 ? 'pos' : 'neg'}>{r.roi === null ? '—' : (r.roi >= 0 ? '+' : '') + Math.round(r.roi * 100) + '%'}</em><small>rendimento a 1 € per giocata</small></div>
      <div><em className={r.clv === null ? '' : r.clv >= 0 ? 'pos' : 'neg'}>{r.clv === null ? '—' : (r.clv >= 0 ? '+' : '') + (r.clv * 100).toFixed(1) + '%'}</em><small>CLV · {r.clvN} misurate</small></div>
    </div>
    <p>{r.pending} in attesa del risultato. {r.n < 100 ? 'Servono almeno 100 giocate chiuse perché il rendimento dica qualcosa: il CLV è affidabile molto prima (50–100).' : ''}</p>
  </article>;
}

export function TipsterView({ equityCents, onRecord }: { equityCents: number; onRecord?: RecordPlay }) {
  const [d, setD] = useState<Data | null>(null), [err, setErr] = useState(''), [info, setInfo] = useState(false);
  const dayF = useDay('tipster');
  useEffect(() => { if (!dayF.ready) return; setD(null); fetch('/api/scanner?view=tipster' + (dayF.day ? '&day=' + dayF.day : ''), { cache: 'no-store' }).then(r => r.json()).then((x: any) => x.error ? setErr(x.error) : setD(x), () => setErr('Dati non disponibili.')); }, [dayF.ready, dayF.day]);
  const [days, setDays] = useState<{ day: string; n: number }[] | undefined>(undefined);
  useEffect(() => { if (d?.days) setDays(d.days); }, [d]);
  const stakeOf = (s: number) => Math.max(100, Math.round(equityCents * s / 50) * 50);
  const leg = (l: L) => ({ fixtureId: l.fixtureId, fixture: l.fixture, competition: l.competition, kickoff: l.kickoff, market: l.market, label: l.label, p: l.pTrue, odds: l.odds });
  return <div className="page tipster-page">
    <div className="page-head"><div><p className="eyebrow">IL METODO DEI PROFESSIONISTI</p><h1><Crosshair className="h1-icon" />Tipster</h1><p>Si gioca solo quando la quota italiana è più alta della probabilità vera. Poche giocate, singole e doppie, puntata proporzionata al valore.</p></div></div>
    <div className="tip-rules">
      {[['1', 'Quota più alta del giusto', 'Si gioca solo se un bookmaker italiano (Lottomatica / Planetwin365, Snai, Sisal, Eurobet) paga almeno il 3% in più della quota giusta. QUORUM ti dice dove.'],
        ['2', 'Probabilità vera = Pinnacle', 'La quota giusta viene dal bookmaker dei professionisti, senza il suo margine. Se manca, dalla media di tutti i bookmaker.'],
        ['3', 'Solo singole e doppie', 'Ogni partita in più moltiplica il margine del banco: niente multiple lunghe.'],
        ['4', 'Puntata in % del capitale', '¼ di Kelly: più valore = puntata più alta, mai oltre il 2% (1% per le doppie).']].map(([n, t, x]) => <div key={n} className="tip-rule"><span>{n}</span><b>{t}</b><small>{x}</small></div>)}
    </div>
    <DayFilter days={days} day={dayF.day} onChange={dayF.setDay} />
    {err ? <div className="empty"><span className="empty-icon"><Info /></span><h3>Tipster non disponibile</h3><p>{err}</p></div>
      : !d ? <div className="empty"><span className="empty-icon"><RefreshCw className="spin" /></span><h3>Cerco le quote sbagliate…</h3></div>
      : <>
        <h3 className="day-title">📒 Il registro reale del metodo</h3>
        <p className="small-note">Ogni proposta viene registrata con la quota del momento e chiusa col risultato vero. Il <b>CLV</b> dice di quanto la quota presa batte la probabilità vera al calcio d’inizio: è il numero che i professionisti guardano per capire se hanno un vantaggio, perché si stabilizza dopo poche decine di giocate.</p>
        <button className={'info-toggle' + (info ? ' on' : '')} onClick={() => setInfo(!info)} aria-expanded={info}><Info size={16} />{info ? 'Chiudi la spiegazione' : 'Cos’è il CLV, come si calcolano i numeri e perché il Tipster ha valore'}</button>
        {info && <RecordInfo study={d.study} />}
        <div className="tip-rec-grid"><RecordCard title="Singole" r={d.record['tipster-singola']} /><RecordCard title="Doppie" r={d.record['tipster-doppia']} /></div>

        <h3 className="day-title">🎯 Singole di valore</h3>
        {!d.singles.length ? <p className="small-note">Oggi nessuna quota italiana supera la quota giusta di almeno il 3%. È normale: il metodo gioca poco. Nessuna giocata è meglio di una giocata senza valore.</p>
          : <div className="tip-list">{d.singles.map(l => <article key={l.fixtureId + l.market} className="tip-card">
            <div className="tip-top"><small>{l.competition} · {when(l.kickoff)}</small><span className="tip-edge">+{(l.edge * 100).toFixed(1)}%</span></div>
            <strong>{l.fixture}</strong>
            {l.ageH !== null && l.ageH !== undefined && <p className={'tip-age' + (l.ageH > 14 ? ' old' : '')}>Quota letta {l.ageH < 1 ? 'meno di un’ora fa' : Math.round(l.ageH) + ' ore fa'}: prima di giocare controlla che sul sito sia ancora {l.odds.toFixed(2)} o più.</p>}
            <div className="tip-pick"><b>{l.label}</b><span className="tip-odds">{l.odds.toFixed(2)}<small>{l.bookmaker}</small></span></div>
            {l.all && Object.keys(l.all).length > 1 && <div className="tip-books">{Object.entries(l.all).sort((a, b) => b[1] - a[1]).map(([b, o]) => <span key={b} className={o === l.odds ? 'best' : (l.pTrue * o - 1 >= 0.03 ? 'ok' : '')}>{b === 'Lottomatica' ? 'Lottomatica/Planetwin' : b}<b>{o.toFixed(2)}</b></span>)}</div>}
            <div className="tip-facts"><span>Probabilità vera <b>{percent(l.pTrue, 0)}</b><small>{l.source}</small></span><span>Quota giusta <b>{(1 / l.pTrue).toFixed(2)}</b></span><span>Puntata <b>{money(stakeOf(l.stake))}</b><small>{(l.stake * 100).toFixed(1)}% del capitale</small></span></div>
            {l.modelAgrees !== null && <p className={'tip-model ' + (l.modelAgrees ? 'ok' : 'no')}>{l.modelAgrees ? '✓ Anche il modello QUORUM la vede con valore' : '⚠ Il modello QUORUM non è d’accordo: puntata minima o salta'}</p>}
            {onRecord && <button className="secondary played-button" onClick={() => onRecord([leg(l)], stakeOf(l.stake), 'value', 'tipster-singola')}><Check size={15} />L’ho giocata ({money(stakeOf(l.stake))})</button>}
          </article>)}</div>}

        <h3 className="day-title">🔎 Il controllo di QUORUM</h3>
        <p className="small-note">Come un tipster: per ogni partita {dayF.day ? 'del giorno scelto' : 'dei prossimi giorni'} QUORUM confronta la quota più alta tra Lottomatica / Planetwin365, Snai, Sisal ed Eurobet con la quota giusta di Pinnacle (o della media del mercato). Adesso: <b>{d.compared ?? 0} quote controllate</b> su <b>{d.matches ?? 0} partite</b>, comprese Champions ed Europa League.</p>
        {d.near && d.near.length > 0 && <div className="standings-card"><table className="standings near-table"><thead><tr><th className="t-team">Le più vicine al valore</th><th>Quota</th><th>Giusta</th><th>Errore</th></tr></thead>
          <tbody>{d.near.map(n => <tr key={n.fixture + n.label}><td className="t-team"><span><b>{n.label}</b> · {n.fixture}<small>{n.competition} · {when(n.kickoff)} · {n.bookmaker === 'Lottomatica' ? 'Planetwin' : n.bookmaker}</small></span></td><td><b>{n.odds.toFixed(2)}</b></td><td>{n.fair.toFixed(2)}</td><td className={n.edge >= 0 ? 'clv-pos' : 'clv-neg'}>{(n.edge >= 0 ? '+' : '') + (n.edge * 100).toFixed(1)}%</td></tr>)}</tbody></table>
          <p className="legend-zones"><span>Errore = quanto la quota del bookmaker paga in più (+) o in meno (−) rispetto a quella giusta. Una giocata diventa “di valore” da +3%: se una di queste quote sale, compare nelle singole.</span></p></div>}
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
        <StudyTable study={d.study} />
      </>}
  </div>;
}

export function StudyTable({ study }: { study: Study[] }) {
  return <>
        <div className="standings-card"><table className="standings study">
          <thead><tr><th className="t-team">Campionato</th><th>Occasioni a stagione</th><th className="hide-sm">Con più bookmaker</th><th>CLV</th><th className="hide-sm">Margine</th></tr></thead>
          <tbody>{[...study].sort((a, b) => b.single[0] - a.single[0]).map(s => <tr key={s.code} className={OURS.includes(s.code) ? 'ours' : ''}>
            <td className="t-team"><span>{s.name}</span>{OURS.includes(s.code) && <em className="ours-tag">in QUORUM</em>}</td>
            <td><b>{Math.round(s.single[0] / 4)}</b></td><td className="hide-sm">{Math.round(s.shop[0] / 4)}</td>
            <td className={s.clv === null ? '' : s.clv > 0.015 ? 'clv-pos' : s.clv < 0 ? 'clv-neg' : ''}>{s.clv === null ? '—' : (s.clv > 0 ? '+' : '') + (s.clv * 100).toFixed(1) + '%'}</td>
            <td className="hide-sm">{(s.margin * 100).toFixed(1)}%</td></tr>)}</tbody>
        </table>
          <p className="legend-zones"><span>Con un solo bookmaker le occasioni sono poche; confrontando più bookmaker diventano 3–5 volte tante. Il rendimento su poche decine di giocate è rumore: per decidere conta il CLV.</span></p></div>
  </>;
}
