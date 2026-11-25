'use client';
// Centro Tipster: the professional bettor's dashboard. Data refreshed after every scan (every 3 hours).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, BarChart3, Check, Gauge as GaugeIcon, Info, ListChecks, Radar, RefreshCw, Scale, TrendingDown, X } from 'lucide-react';
import { money, percent } from '../lib/math';
import type { RecordPlay } from '../lib/types';
import { Core, CountUp, Countdown, Curve, Gauge, MatrixRain, Ticker, Tilt } from './tc-visuals';
import { INFO, INFO_ORDER, WHY } from './tc-info';
import { BookOpen } from 'lucide-react';

const when = (s: string) => new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const hm = (s: string) => new Date(s).toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
const sg = (x: number | null | undefined, d = 1) => x === null || x === undefined ? '—' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d).replace('.', ',') + '%';
const pp = (x: number) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1).replace('.', ',') + ' pt';
const cls = (x: number | null | undefined) => x === null || x === undefined ? '' : x >= 0 ? 'pos' : 'neg';
const TABS: [string, string, any][] = [['guide', 'Guida del pannello', BookOpen], ['opp', 'Opportunità', ListChecks], ['perf', 'Prestazioni', GaugeIcon], ['seg', 'Dove guadagno', BarChart3], ['moves', 'Movimenti', Radar], ['margins', 'Margini', Scale], ['streaks', 'Serie', TrendingDown]];
const VERDICT: Record<string, [string, string]> = {
  nessuna: ['Ancora nessun dato', 'Il registro si riempie da solo con le proposte del Tipster.'],
  presto: ['Troppo presto per dirlo', 'Servono almeno 20 giocate misurate col CLV (o 30 chiuse): prima di allora qualsiasi risultato può essere fortuna.'],
  bravura: ['Vantaggio reale', 'Il CLV (o il rendimento) è sopra zero in modo statisticamente solido: non è solo fortuna.'],
  promettente: ['Promettente', 'Il CLV è positivo ma non ancora abbastanza stabile: continua e guarda quante giocate servono ancora.'],
  fortuna: ['Nessun vantaggio dimostrato', 'Il CLV è intorno a zero o sotto: i risultati, buoni o cattivi, dipendono dalla fortuna.'],
  svantaggio: ['Stai pagando troppo', 'Il CLV è negativo in modo solido: le quote prese sono peggiori della chiusura. Rivedi mercati e campionati.'],
};

type Center = any;
export function TipsterCenter({ equityCents, stakeBps, limitsOn, onRecord }: { equityCents: number; stakeBps: number; limitsOn: boolean; onRecord?: RecordPlay }) {
  const [src, setSrc] = useState<'metodo' | 'mie'>('metodo'), [tab, setTab] = useState('opp'), [d, setD] = useState<Center | null>(null), [err, setErr] = useState('');
  const [infoId, setInfoId] = useState<string | null>(null), [why, setWhy] = useState(false);
  const I = (id: string, light = false) => <button type="button" className={'tcx-i' + (light ? ' light' : '')} aria-label={'Informazioni: ' + INFO[id].title} onClick={e => { e.stopPropagation(); setInfoId(id); }}>i</button>;
  const [segTab, setSegTab] = useState('league'), [mSet, setMSet] = useState(0), [open, setOpen] = useState(''), [help, setHelp] = useState(false);
  useEffect(() => { setD(null); setErr(''); fetch('/api/scanner?view=tipster-center' + (src === 'mie' ? '&source=mie' : ''), { cache: 'no-store' }).then(r => r.json()).then((x: any) => x.error ? setErr(x.error) : setD(x), () => setErr('Dati non disponibili.')); }, [src]);
  const cap = limitsOn ? stakeBps / 10000 : 0.02;
  const stakeOf = (units: number) => units > 0 ? Math.max(100, Math.floor(equityCents * Math.min(units / 100, cap) / 50) * 50) : 0;
  const p = d?.performance, opps = d?.opportunities?.list ?? [], nA = opps.filter((o: any) => o.grade === 'A').length, nB = opps.filter((o: any) => o.grade === 'B').length;
  const steam = (d?.moves ?? []).filter((m: any) => m.kind === 'steam').length;
  const bestBook = d?.margins?.books?.length ? d.margins.books.map((b: string) => [b, d.margins.table[0].avg[b]] as [string, number | null]).filter((x: any) => x[1] !== null).sort((a: any, b: any) => a[1] - b[1])[0] : null;
  const tone = !p || p.clv === null ? 'amber' : p.clv >= 0 ? 'lime' : 'red';
  const ticker = (d?.moves ?? []).slice(0, 24).map((m: any) => ({ k: m.fixtureId + m.market, tone: m.kind === 'steam' ? 'up' as const : 'down' as const, text: m.fixture + ' · ' + m.label + ' ' + pp(m.dOpen) + (m.it ? ' · ' + m.it.odds.toFixed(2) + ' ' + m.it.book : '') }));
  return <div className="page tc-page tc-dark">
    <section className="tcx-hero">
      <MatrixRain />
      <i className="tcx-scan" aria-hidden="true" /><i className="tcx-grid" aria-hidden="true" />
      <div className="tcx-hero-in">
        <div className="tcx-intro">
          <p className="tcx-eyebrow"><i className="tcx-live" />QUORUM · LA MENTE DEL TIPSTER</p>
          <h1>Centro Tipster</h1>
          <p>Ogni 3 ore QUORUM entra nel mercato: legge {d ? d.opportunities.compared : '…'} quote italiane, segue Pinnacle, scarta le quote vecchie e ti lascia solo quello che un professionista giocherebbe.</p>
          <div className="tcx-srcrow"><div className="tc-src"><button className={src === 'metodo' ? 'on' : ''} onClick={() => setSrc('metodo')}>Metodo QUORUM</button><button className={src === 'mie' ? 'on' : ''} onClick={() => setSrc('mie')}>Le mie giocate</button></div>{I('sources')}</div>
          <div className="tcx-cd">{I('countdown')}<Countdown /></div>
          <button className="tcx-why" onClick={() => setWhy(true)}><Info size={15} />Perché questo pannello è il cuore di QUORUM</button>
          {d && <small className="tcx-last">Ultimo controllo {d.run?.finished_at ? when(d.run.finished_at) : when(d.at)}</small>}
        </div>
        <div className="tcx-corewrap"><span className="tcx-corei">{I('core')}{I('verdict')}</span><Core label="CLV medio" value={p ? sg(p.clv) : '…'} sub={p ? (VERDICT[p.verdict] ?? VERDICT.nessuna)[0] : 'Avvio del controllo'} tone={tone} orbit={nA + nB} /></div>
        <div className="tcx-tiles">
          <Tilt className="tcx-tile t-lime"><span>Opportunità {I('tOpp')}</span><strong>{d ? <CountUp to={nA + nB} format={v => String(Math.round(v))} /> : '…'}</strong><small>{nA} voto A · {nB} voto B</small></Tilt>
          <Tilt className={'tcx-tile ' + (p && p.units < 0 ? 't-red' : 't-lime')}><span>Unità {src === 'mie' ? 'tue' : 'metodo'} {I('tUnits')}</span><strong>{p ? <CountUp to={p.units} format={v => (v >= 0 ? '+' : '') + v.toFixed(2).replace('.', ',')} /> : '…'}</strong><small>{p ? p.n + ' chiuse · ' + p.pending + ' in attesa' : ''}</small></Tilt>
          <Tilt className="tcx-tile t-amber"><span>Steam attivi {I('tSteam')}</span><strong>{d ? <CountUp to={steam} format={v => String(Math.round(v))} /> : '…'}</strong><small>Pinnacle in movimento</small></Tilt>
          <Tilt className="tcx-tile t-ice"><span>Bookmaker più generoso {I('tMargin')}</span><strong>{bestBook ? percent(bestBook[1] as number, 1) : '—'}</strong><small>{bestBook ? (bestBook[0] === 'Lottomatica' ? 'Lottomatica / Planetwin' : bestBook[0]) + ' · margine 1X2' : 'in attesa delle quote'}</small></Tilt>
        </div>
      </div>
      <div className="tcx-tickwrap"><Ticker items={ticker} />{ticker.length > 0 && I('ticker')}</div>
    </section>
    {p && <div className="tcx-row">
      <Tilt className="tcx-panel" max={6}><span className="tcx-pi">{I('gSignal')}</span><Gauge v={p.tClv === null ? 0 : Math.max(0, Math.min(1, p.tClv / 3))} label="Forza del segnale" value={p.tClv === null ? '—' : p.tClv.toFixed(1).replace('.', ',')} sub="sopra 2 = non è fortuna" /></Tilt>
      <Tilt className="tcx-panel wide" max={4}><div className="tcx-panel-head"><span>Curva delle unità {I('gCurve')}</span><b className={cls(p.units)}>{(p.units >= 0 ? '+' : '') + p.units.toFixed(2).replace('.', ',')} u</b></div><Curve points={p.curve ?? []} /></Tilt>
      <Tilt className="tcx-panel" max={6}><span className="tcx-pi">{I('gBeat')}</span><Gauge v={p.clvBeat ?? 0} label="Battono la chiusura" value={p.clvBeat === null ? '—' : percent(p.clvBeat, 0)} sub={p.clvN + ' giocate misurate'} /></Tilt>
    </div>}
    <div className="tc-bar">
      <button className="info-toggle" onClick={() => setHelp(!help)}><Info size={15} />{help ? 'Chiudi' : 'Come si usa il Centro Tipster'}</button>
    </div>
    {help && <div className="rec-info"><ul>
      <li><b>Opportunità</b>: le giocate del momento con la checklist del tipster. <b>A</b> = passa tutti i controlli, puntata piena; <b>B</b> = un controllo non critico manca, mezza puntata; <b>C</b> = da non giocare (lì per trasparenza).</li>
      <li><b>Unità</b>: 1 unità = 1% del saldo. La puntata è ¼ di Kelly sul valore, mai oltre la tua regola di gestione del capitale ({percent(cap, 1)} a giocata).</li>
      <li><b>Prestazioni</b> e <b>Dove guadagno</b> rispondono a due domande: “sto vincendo per bravura o per fortuna?” e “in quali campionati, mercati e quote ho davvero un vantaggio?”. In alto scegli se guardare il registro del metodo QUORUM o le tue giocate.</li>
      <li><b>Movimenti</b>: come cambia la probabilità vera (Pinnacle) dalla prima scansione. Se sale e il bookmaker italiano paga ancora il vecchio prezzo, è lì che si trovano le quote sbagliate.</li>
      <li><b>Margini</b>: quanto si tiene ogni bookmaker. <b>Serie</b>: se la tua serie peggiore è normale sfortuna o un segnale.</li>
    </ul></div>}
    <div className="tc-tabs">{TABS.map(([k, l, I]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><I size={15} />{l}{k === 'opp' && d ? <b>{d.opportunities.list.filter((o: any) => o.grade !== 'C').length}</b> : null}</button>)}</div>
    {err ? <div className="empty"><span className="empty-icon"><Info /></span><h3>Centro Tipster non disponibile</h3><p>{err}</p></div>
      : !d ? <div className="empty"><span className="empty-icon"><RefreshCw className="spin" /></span><h3>Faccio il controllo completo…</h3></div>
      : <>
        {tab === 'guide' && <section className="tcx-guide">
          <div className="tcx-manifest"><h3>{WHY.title}</h3>{WHY.text.map((t, i) => <p key={i}>{t}</p>)}</div>
          {[...new Set(INFO_ORDER.map(k => INFO[k].group))].map(g => <div key={g} className="tcx-ggroup"><h4>{g}</h4>
            {INFO_ORDER.filter(k => INFO[k].group === g).map(k => <details key={k} className="tcx-gitem"><summary><span className="tcx-i static">i</span>{INFO[k].title}</summary><InfoBody id={k} /></details>)}</div>)}
        </section>}
        {tab === 'opp' && <section>
          <p className="small-note">Confrontate {d.opportunities.compared} quote italiane su {d.opportunities.matches} partite. Una giocata compare solo se la quota italiana batte la probabilità vera di almeno il 3%; poi passa la checklist.</p>
          {!d.opportunities.list.length ? <div className="empty compact"><span className="empty-icon"><ListChecks /></span><h3>Nessuna opportunità in questo momento.</h3><p>È normale: un tipster gioca poco. Il prossimo controllo arriva con la scansione tra meno di 3 ore. Intanto guarda la lista “in osservazione” qui sotto.</p></div>
            : <div className="tc-opps">{d.opportunities.list.map((o: any) => { const k = o.fixtureId + o.market, st = stakeOf(o.units); return <article key={k} className={'tc-opp g-' + o.grade}>
              <div className="tc-opp-top"><span className={'tc-grade g-' + o.grade}>{o.grade}</span><div><small>{o.competition} · {when(o.kickoff)}</small><strong>{o.fixture}</strong></div><span className="tip-edge">{sg(o.edge)}</span>{I('opp')}</div>
              <div className="tc-opp-pick"><b>{o.label}</b><span><em>{o.odds.toFixed(2)}</em><small>{o.bookmaker}</small></span><span><em>{o.fair.toFixed(2)}</em><small>quota giusta</small></span><span><em>{o.grade === 'C' ? '—' : o.units.toFixed(1).replace('.', ',') + ' u'}{I('units')}</em><small>{o.grade === 'C' ? 'non giocare' : money(st)}</small></span></div>
              <ul className="tc-checks">{o.checks.map((c: any) => <li key={c.id} className={c.ok === true ? 'ok' : c.ok === false ? 'ko' : 'na'} title={c.note} role="button" tabIndex={0} onClick={() => setInfoId(CK[c.id] ?? 'opp')}><i>{c.ok === true ? <Check size={13} /> : c.ok === false ? <X size={13} /> : '?'}</i>{c.label}</li>)}</ul>
              <button className="text-button" onClick={() => setOpen(open === k ? '' : k)}>{open === k ? 'Chiudi i dettagli' : 'Perché? Vedi i dettagli dei controlli'}</button>
              {open === k && <ul className="tc-notes">{o.checks.map((c: any) => <li key={c.id}><b>{c.label}</b>: {c.note}</li>)}</ul>}
              {onRecord && o.grade !== 'C' && <button className="secondary played-button" onClick={() => onRecord([{ fixtureId: o.fixtureId, fixture: o.fixture, competition: o.competition, kickoff: o.kickoff, market: o.market, label: o.label, p: o.pTrue, odds: o.odds }], st, 'value', 'tipster-centro')}><Check size={15} />L’ho giocata ({money(st)})</button>}
            </article>; })}</div>}
          {d.opportunities.watch.length > 0 && <><h3 className="day-title">👀 In osservazione {I('watch')}</h3>
            <p className="small-note">Pinnacle si sta muovendo e la quota italiana è vicina al valore (0–3%). Se il bookmaker italiano non si adegua e Pinnacle continua, diventano opportunità al prossimo controllo.</p>
            <div className="tc-table"><table><thead><tr><th>Partita</th><th>Esito</th><th>Probabilità vera</th><th>Quota italiana</th><th>Valore</th></tr></thead><tbody>{d.opportunities.watch.map((m: any) => <tr key={m.fixtureId + m.market}><td>{m.fixture}<small>{when(m.kickoff)}</small></td><td>{m.label}</td><td>{percent(m.pOpen, 0)} → <b>{percent(m.pNow, 0)}</b></td><td>{m.it ? m.it.odds.toFixed(2) + ' ' + m.it.book : '—'}</td><td className={cls(m.edge)}>{sg(m.edge)}</td></tr>)}</tbody></table></div></>}
        </section>}

        {tab === 'perf' && (() => { const p = d.performance, v = VERDICT[p.verdict] ?? VERDICT.nessuna; return <section>
          <div className={'tc-verdict v-' + p.verdict}><GaugeIcon size={22} /><div><strong>{v[0]}</strong><p>{v[1]}{p.needed ? ' Con questo CLV servono ancora circa ' + p.needed + ' giocate per averne la certezza statistica.' : ''}</p></div></div>
          <div className="tcx-secinfo">{I('pKpi')}<small>Giocate e vinte</small>{I('pYield')}<small>Rendimento</small>{I('pClv')}<small>CLV e forza</small></div>
          <div className="tc-kpis">
            <div><span>Giocate chiuse</span><b>{p.n}</b><small>{p.pending} in attesa</small></div>
            <div><span>Vinte</span><b>{p.won}</b><small>attese {p.expected.toFixed(1).replace('.', ',')} secondo le probabilità</small></div>
            <div><span>Unità</span><b className={cls(p.units)}>{(p.units >= 0 ? '+' : '') + p.units.toFixed(2).replace('.', ',')} u</b><small>1 unità su ogni giocata</small></div>
            <div><span>Rendimento</span><b className={cls(p.yield)}>{sg(p.yield)}</b><small>{p.ci ? 'tra ' + sg(p.ci[0], 0) + ' e ' + sg(p.ci[1], 0) + ' (95%)' : 'servono più giocate'}</small></div>
            <div><span>CLV medio</span><b className={cls(p.clv)}>{sg(p.clv)}</b><small>{p.clvN} misurate · {p.clvBeat === null ? '—' : percent(p.clvBeat, 0) + ' battono la chiusura'}</small></div>
            <div><span>Forza del segnale</span><b>{p.tClv === null ? '—' : p.tClv.toFixed(1).replace('.', ',')}</b><small>t del CLV: sopra 2 = non è fortuna</small></div>
          </div>
          <p className="small-note">Il rendimento ha un intervallo largo perché dipende dai risultati: per questo conta di più il CLV, che misura se compri prezzi migliori della chiusura di Pinnacle. “Forza del segnale” = CLV medio diviso il suo errore: sopra 2 la probabilità che sia solo fortuna è sotto il 5%.</p>
        </section>; })()}

        {tab === 'seg' && <section><div className="tcx-secinfo">{I('seg')}<small>Come si leggono Spingi e Taglia</small></div>
          <div className="archive-tabs">{[['league', 'Campionato'], ['market', 'Mercato'], ['band', 'Fascia di quota'], ['book', 'Bookmaker'], ['lead', 'Anticipo'], ['kind', 'Singole / doppie']].map(([k, l]) => <button key={k} className={segTab === k ? 'on' : ''} onClick={() => setSegTab(k)}>{l}</button>)}</div>
          {!(d.segments[segTab] || []).length ? <p className="small-note">Ancora nessuna giocata in questo registro.</p> : <div className="tc-table"><table><thead><tr><th>{({ league: 'Campionato', market: 'Mercato', band: 'Quota', book: 'Bookmaker', lead: 'Giocata', kind: 'Tipo' } as any)[segTab]}</th><th>Chiuse</th><th>Vinte / attese</th><th>Rendimento</th><th>CLV</th><th></th></tr></thead>
            <tbody>{d.segments[segTab].map((s: any) => <tr key={s.key} className={s.flag ? 'f-' + s.flag : ''}><td>{s.key}</td><td>{s.n}</td><td>{s.won} / {s.expected.toFixed(1).replace('.', ',')}</td><td className={cls(s.yield)}>{sg(s.yield)}</td><td className={cls(s.clv)}>{sg(s.clv)}<small>{s.clvN} misurate</small></td><td>{s.flag === 'spingi' ? <span className="tc-flag up">Spingi</span> : s.flag === 'taglia' ? <span className="tc-flag down">Taglia</span> : <span className="tc-flag">—</span>}</td></tr>)}</tbody></table></div>}
          <p className="small-note"><b>Spingi</b> = CLV sopra +2% su almeno 10 giocate: qui il vantaggio c’è. <b>Taglia</b> = CLV negativo su almeno 10 giocate: qui paghi troppo, anche se magari vinci. La checklist delle opportunità usa queste etichette (sul registro del metodo).</p>
        </section>}

        {tab === 'moves' && <section><div className="tcx-secinfo">{I('moves')}<small>Come si legge il radar</small></div>
          <p className="small-note">Probabilità vera (Pinnacle senza margine) dalla prima volta che QUORUM ha visto la partita a oggi. <b>Steam</b> = la probabilità sale, cioè Pinnacle abbassa la quota perché ci giocano i professionisti: se il bookmaker italiano paga ancora il vecchio prezzo, quella quota è sbagliata. <b>Drift</b> = il mercato va contro: meglio aspettare o evitare.</p>
          {!d.moves.length ? <p className="small-note">Nessun movimento di almeno 2 punti dall’ultima apertura.</p> : <div className="tc-table"><table><thead><tr><th>Partita</th><th>Esito</th><th>Prob. vera</th><th>Variazione</th><th>Ultime 3 ore</th><th>Quota italiana</th><th>Valore ora</th></tr></thead>
            <tbody>{d.moves.map((m: any) => <tr key={m.fixtureId + m.market} className={'mv-' + m.kind}><td>{m.fixture}<small>{m.competition} · {when(m.kickoff)}</small></td><td><span className={'tc-flag ' + (m.kind === 'steam' ? 'up' : 'down')}>{m.kind === 'steam' ? 'Steam' : 'Drift'}</span> {m.label}</td><td>{percent(m.pOpen, 0)} → <b>{percent(m.pNow, 0)}</b><small>dal {hm(m.since)} del {new Date(m.since).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'short' })}</small></td><td className={cls(m.dOpen)}>{pp(m.dOpen)}</td><td className={cls(m.dRecent)}>{m.dRecent === null ? '—' : pp(m.dRecent)}</td><td>{m.it ? <>{m.it.odds.toFixed(2)}<small>{m.it.book}{m.itOpen ? ' · era ' + m.itOpen.toFixed(2) : ''}</small></> : '—'}</td><td className={cls(m.edge)}>{sg(m.edge)}</td></tr>)}</tbody></table></div>}
        </section>}

        {tab === 'margins' && <section><div className="tcx-secinfo">{I('margins')}<small>Come si legge la mappa dei margini</small></div>
          <div className="archive-tabs">{d.margins.table.map((t: any, i: number) => <button key={t.set} className={mSet === i ? 'on' : ''} onClick={() => setMSet(i)}>{t.set}</button>)}</div>
          {!d.margins.books.length ? <p className="small-note">Quote italiane non ancora disponibili per calcolare i margini.</p> : (() => { const t = d.margins.table[mSet]; return <div className="tc-table"><table><thead><tr><th>Campionato</th>{d.margins.books.map((b: string) => <th key={b}>{b === 'Lottomatica' ? 'Lottomatica / Planetwin' : b}</th>)}</tr></thead>
            <tbody>{t.rows.map((r: any) => { const vals = Object.values(r.books).filter((x: any) => x !== null) as number[], best = vals.length ? Math.min(...vals) : null; return <tr key={r.league}><td>{r.league}</td>{d.margins.books.map((b: string) => <td key={b} className={r.books[b] !== null && r.books[b] === best ? 'best' : ''}>{r.books[b] === null ? '—' : percent(r.books[b], 1)}</td>)}</tr>; })}
              <tr className="avg"><td>Media</td>{d.margins.books.map((b: string) => <td key={b}>{t.avg[b] === null ? '—' : percent(t.avg[b], 1)}</td>)}</tr></tbody></table></div>; })()}
          <p className="small-note">Margine = quanto si tiene il bookmaker su quel mercato (somma delle probabilità implicite − 100%). In verde il bookmaker più generoso del campionato. Più il margine è basso, più è facile che una sua quota superi la probabilità vera. Pinnacle sta intorno al 2–3%, i bookmaker italiani di solito tra il 5% e l’8%.</p>
        </section>}

        {tab === 'streaks' && (() => { const s = d.streaks; return <section>
          <div className="tcx-secinfo">{I('streaks')}<small>Come si leggono serie e calo massimo</small></div>
          <div className={'tc-verdict v-' + (s.verdict === 'anomala' ? 'svantaggio' : s.verdict === 'normale' ? 'bravura' : 'nessuna')}><TrendingDown size={22} /><div><strong>{s.verdict === 'nessuna' ? 'Ancora nessuna giocata chiusa' : s.verdict === 'normale' ? 'Serie e cali nella norma' : 'Serie fuori dalla norma'}</strong>
            <p>{s.verdict === 'normale' ? 'La serie negativa peggiore e il calo massimo sono quelli che la sola fortuna produce con queste probabilità: nessun motivo per cambiare metodo o aumentare le puntate.' : s.verdict === 'anomala' ? 'Peggio di come andrebbe 95 volte su 100 per sola sfortuna: fermati e controlla in “Dove guadagno” quali mercati o campionati stanno perdendo.' : 'Il confronto parte dalle prime giocate chiuse.'}</p></div></div>
          <div className="tc-kpis">
            <div><span>Serie attuale</span><b>{s.current ? s.current.n + ' ' + s.current.type : '—'}</b><small>{s.n} giocate chiuse</small></div>
            <div><span>Peggiore serie di perse</span><b>{s.worst}</b><small>con la sola fortuna: tipica {s.expectedWorst}, rara (5%) da {s.worst95}</small></div>
            <div><span>Calo massimo</span><b>{s.drawdown.toFixed(1).replace('.', ',')} u</b><small>raro (5%) oltre {s.dd95.toFixed(1).replace('.', ',')} u</small></div>
            <div><span>Saldo in unità</span><b className={cls(s.units)}>{(s.units >= 0 ? '+' : '') + s.units.toFixed(2).replace('.', ',')} u</b><small>1 unità a giocata</small></div>
          </div>
          <p className="small-note">Il confronto rigioca 2.000 volte le stesse giocate con le stesse probabilità. Esempio: con giocate al 50%, su 100 giocate una serie di 6–7 perse di fila capita quasi sempre. Non è un segnale: è matematica. Raddoppiare dopo una serie negativa è il modo più rapido per bruciare il conto.</p>
        </section>; })()}
      </>}
    {infoId && INFO[infoId] && typeof document !== 'undefined' && createPortal(<div className="tcx-modal" role="dialog" aria-modal="true" onClick={() => setInfoId(null)}><div className="tcx-sheet" onClick={e => e.stopPropagation()}>
      <div className="tcx-sheet-head"><span className="tcx-i static">i</span><div><small>{INFO[infoId].group}</small><h3>{INFO[infoId].title}</h3></div><button onClick={() => setInfoId(null)} aria-label="Chiudi"><X size={18} /></button></div>
      <InfoBody id={infoId} />
      <button className="text-button" onClick={() => { setInfoId(null); setTab('guide'); }}>Apri la guida completa del pannello</button>
    </div></div>, document.body)}
    {why && typeof document !== 'undefined' && createPortal(<div className="tcx-modal" role="dialog" aria-modal="true" onClick={() => setWhy(false)}><div className="tcx-sheet" onClick={e => e.stopPropagation()}>
      <div className="tcx-sheet-head"><span className="tcx-i static">i</span><div><small>Centro Tipster</small><h3>{WHY.title}</h3></div><button onClick={() => setWhy(false)} aria-label="Chiudi"><X size={18} /></button></div>
      {WHY.text.map((t, i) => <p key={i} className="tcx-why-p">{t}</p>)}
      <button className="text-button" onClick={() => { setWhy(false); setTab('guide'); }}>Leggi la spiegazione di ogni voce</button>
    </div></div>, document.body)}
  </div>;
}
const CK: Record<string, string> = { value: 'ckValue', sharp: 'ckSharp', fresh: 'ckFresh', move: 'ckMove', model: 'ckModel', news: 'ckNews', history: 'ckHistory' };
function InfoBody({ id }: { id: string }) {
  const x = INFO[id];
  return <dl className="tcx-info">{([['Come funziona', x.come], ['Obiettivo', x.obiettivo], ['Come si legge', x.leggere], ['Come va interpretato', x.interpretare], ['Cosa porta nel lungo periodo', x.lungo]] as [string, string][]).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}
