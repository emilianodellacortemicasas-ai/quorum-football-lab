'use client';
// Centro Tipster: the professional bettor's dashboard. Data refreshed after every scan (every 3 hours).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, BarChart3, Check, Gauge as GaugeIcon, Info, ListChecks, Radar, RefreshCw, Scale, TrendingDown, X } from 'lucide-react';
import { money, percent } from '../lib/math';
import type { RecordPlay } from '../lib/types';
import { Core, CountUp, Countdown, Curve, Gauge, MatrixRain, Ticker, Tilt } from './tc-visuals';
import { INFO, INFO_ORDER, WHY } from './tc-info';
import { BookOpen, Percent } from 'lucide-react';
import { ValueView } from './value';
import { RecordInfo, StudyTable } from './tipster';
import { LEAGUE_STUDY } from '../lib/league-study-data';

const when = (s: string) => new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const hm = (s: string) => new Date(s).toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
const sg = (x: number | null | undefined, d = 1) => x === null || x === undefined ? '—' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d).replace('.', ',') + '%';
const pp = (x: number) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1).replace('.', ',') + ' pt';
const cls = (x: number | null | undefined) => x === null || x === undefined ? '' : x >= 0 ? 'pos' : 'neg';
const TABS: [string, string, any][] = [['guide', 'Guida del pannello', BookOpen], ['opp', 'Opportunità', ListChecks], ['perf', 'Prestazioni', GaugeIcon], ['seg', 'Dove guadagno', BarChart3], ['moves', 'Movimenti', Radar], ['margins', 'Margini', Scale], ['streaks', 'Serie', TrendingDown], ['value', 'Tutte le quote di valore', Percent]];
const VERDICT: Record<string, [string, string]> = {
  nessuna: ['Ancora nessun dato', 'Il registro si riempie da solo con le proposte del Tipster.'],
  presto: ['Troppo presto per dirlo', 'Servono almeno 20 giocate misurate col CLV (o 30 chiuse): prima di allora qualsiasi risultato può essere fortuna.'],
  bravura: ['Vantaggio reale', 'Il CLV (o il rendimento) è sopra zero in modo statisticamente solido: non è solo fortuna.'],
  promettente: ['Promettente', 'Il CLV è positivo ma non ancora abbastanza stabile: continua e guarda quante giocate servono ancora.'],
  fortuna: ['Nessun vantaggio dimostrato', 'Il CLV è intorno a zero o sotto: i risultati, buoni o cattivi, dipendono dalla fortuna.'],
  svantaggio: ['Stai pagando troppo', 'Il CLV è negativo in modo solido: le quote prese sono peggiori della chiusura. Rivedi mercati e campionati.'],
};

type Center = any;
export function TipsterCenter({ equityCents, stakeBps, limitsOn, onRecord, notify, onOpen, initialTab }: { equityCents: number; stakeBps: number; limitsOn: boolean; onRecord?: RecordPlay; notify: (m: string) => void; onOpen: (id: string) => void; initialTab?: string }) {
  const [src, setSrc] = useState<'metodo' | 'mie'>('metodo'), [tab, setTab] = useState(initialTab || 'opp'), [d, setD] = useState<Center | null>(null), [err, setErr] = useState('');
  // "L'ho giocata": amount and price chosen by the user (prefilled with QUORUM's suggestion).
  const [playAmt, setPlayAmt] = useState<Record<string, string>>({}), [playOdds, setPlayOdds] = useState<Record<string, string>>({}), [saved, setSaved] = useState<Record<string, boolean>>({});
  const euros = (c: number) => (c / 100).toFixed(2).replace('.', ',');
  // Real price seen on the site: saved for everyone, the opportunity is re-graded at once.
  const [reload, setReload] = useState(0);
  const sendReport = async (key: string, q: number) => { try { const r = await fetch('/api/scanner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'price-report', key, odds: q }) }); if (r.ok) { notify('Quota aggiornata a ' + q.toFixed(2) + ': livello e valore ricalcolati.'); setReload(x => x + 1); } else notify('Aggiornamento della quota non riuscito.'); } catch { notify('Aggiornamento della quota non riuscito.'); } };
  const playBox = ({ k, suggested, odds, p, record, report }: { k: string; suggested: number; odds: number; p: number; report?: string; record: (stakeCents: number, odds: number) => Promise<boolean> | boolean | void }) => {
    const amt = playAmt[k] ?? euros(suggested), cents = Math.round(Number(amt.replace(',', '.')) * 100) || 0, oddsTxt = playOdds[k] ?? odds.toFixed(2), q = Number(oddsTxt.replace(',', '.')) || 0;
    const pct = equityCents > 0 ? cents / equityCents : 0, over = limitsOn && cents > Math.max(100, Math.floor(equityCents * stakeBps / 10000));
    return <div className="tcx-play">
      <div className="tcx-play-in"><label><small>Quanto hai giocato</small><span><input inputMode="decimal" value={amt} onChange={e => setPlayAmt({ ...playAmt, [k]: e.target.value.replace(/[^0-9.,]/g, '') })} /><b>€</b></span></label>
        <label><small>Quota presa</small><span><input inputMode="decimal" value={oddsTxt} onChange={e => setPlayOdds({ ...playOdds, [k]: e.target.value.replace(/[^0-9.,]/g, '') })} /></span></label>
        <div className="tcx-play-quick">{[1, 2, 3, 5].map(e => <button key={e} type="button" className={cents === e * 100 ? 'on' : ''} onClick={() => setPlayAmt({ ...playAmt, [k]: euros(e * 100) })}>{e} €</button>)}</div></div>
      {q > 1 && Math.abs(q - odds) >= 0.01 && <p className={'tcx-play-val ' + (p * q - 1 >= 0.03 ? 'ok' : p * q - 1 >= 0 ? 'mid' : 'ko')}>Con la quota {q.toFixed(2)} invece di {odds.toFixed(2)}: valore {(p * q - 1 >= 0 ? '+' : '') + ((p * q - 1) * 100).toFixed(1).replace('.', ',')}%. {p * q - 1 >= 0.03 ? 'Ha ancora valore: puoi giocarla.' : p * q - 1 >= 0 ? 'Valore quasi nullo: il vantaggio è sparito, meglio lasciar perdere.' : 'Senza valore: a questa quota il metodo NON la giocherebbe (quota giusta ' + (1 / p).toFixed(2) + ').'}</p>}
      <p className={'tcx-play-note' + (over ? ' warn' : cents > suggested ? ' hi' : '')}>{cents < 100 ? 'Minimo 1 €.' : percent(pct, 1) + ' del tuo saldo' + (cents > 0 && q > 1 ? ' · se vince incassi ' + money(Math.round(cents * q)) : '') + (over ? ' · oltre la tua regola di capitale (' + percent(stakeBps / 10000, 1) + '): QUORUM non la registra, abbassa l’importo o cambia regola nel Portafoglio.' : cents > suggested ? ' · più della puntata consigliata (' + money(suggested) + ').' : '')}</p>
      {report && q > 1 && Math.abs(q - odds) >= 0.01 && <button type="button" className="text-button" onClick={() => sendReport(report, q)}>Non l’ho giocata: aggiorna solo la quota a {q.toFixed(2)}</button>}
      <button className="secondary played-button" disabled={cents < 100 || !(q > 1) || saved[k]} onClick={async () => { const ok = await record(cents, q); if (ok !== false) { setSaved({ ...saved, [k]: true }); if (report && Math.abs(q - odds) >= 0.01) sendReport(report, q); } }}><Check size={15} />{saved[k] ? 'Registrata' : 'L’ho giocata a ' + money(cents) + (q > 1 ? ' · quota ' + q.toFixed(2) : '')}</button>
    </div>;
  };
  const [infoId, setInfoId] = useState<string | null>(null), [why, setWhy] = useState(false);
  const I = (id: string, light = false) => <button type="button" className={'tcx-i' + (light ? ' light' : '')} aria-label={'Informazioni: ' + INFO[id].title} onClick={e => { e.stopPropagation(); setInfoId(id); }}>i</button>;
  const [segTab, setSegTab] = useState('league'), [mSet, setMSet] = useState(0), [open, setOpen] = useState(''), [help, setHelp] = useState(false);
  useEffect(() => { setD(null); setErr(''); fetch('/api/scanner?view=tipster-center' + (src === 'mie' ? '&source=mie' : ''), { cache: 'no-store' }).then(r => r.json()).then((x: any) => x.error ? setErr(x.error) : setD(x), () => setErr('Dati non disponibili.')); }, [src, reload]);
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
        {tab === 'value' && <section className="tcx-value"><ValueView equityCents={equityCents} notify={notify} onRecord={onRecord} onOpen={onOpen} /></section>}
        {tab === 'guide' && <section className="tcx-guide">
          <div className="tcx-manifest"><h3>{WHY.title}</h3>{WHY.text.map((t, i) => <p key={i}>{t}</p>)}</div>
          {[...new Set(INFO_ORDER.map(k => INFO[k].group))].map(g => <div key={g} className="tcx-ggroup"><h4>{g}</h4>
            {INFO_ORDER.filter(k => INFO[k].group === g).map(k => <details key={k} className="tcx-gitem"><summary><span className="tcx-i static">i</span>{INFO[k].title}</summary><InfoBody id={k} /></details>)}</div>)}
          <div className="tcx-ggroup"><h4>CLV e backtest del metodo</h4><RecordInfo study={LEAGUE_STUDY as any} />
            <h3 className="day-title">🔬 Dove i bookmaker sbagliano di più</h3><StudyTable study={LEAGUE_STUDY as any} /></div>
        </section>}
        {tab === 'opp' && (() => {
          const list = d.opportunities.list, play = list.filter((o: any) => o.grade !== 'C');
          const failed = (o: any) => o.checks.filter((c: any) => c.ok === false).map((c: any) => c.label.toLowerCase());
          const GRADE: Record<string, [string, string, string]> = {
            A: ['GIOCALA', 'Livello A · puntata piena', 'Ha superato tutti i controlli: valore, prezzo dei professionisti, quota fresca, mercato, modello, notizie e storico.'],
            B: ['GIOCALA CON MEZZA PUNTATA', 'Livello B · metà della puntata', 'Valore e quota sono buoni, ma un controllo non critico non è superato'],
            C: ['NON GIOCARE', 'Livello C · solo per trasparenza', 'Manca un controllo critico'],
          };
          return <section>
          <p className="small-note">Confrontate {d.opportunities.compared} quote italiane su {d.opportunities.matches} partite. Una giocata compare solo se la quota italiana batte la probabilità vera di almeno il 3%; poi passa la checklist.</p>
          {play.length > 0 && <div className="tcx-alert"><span className="tcx-alert-dot" /><div><small>{play.length === 1 ? '1 GIOCATA CONSIGLIATA ORA' : play.length + ' GIOCATE CONSIGLIATE ORA'}</small>
            {play.map((o: any) => <p key={o.fixtureId + o.market}><b className={'lv g-' + o.grade}>{o.grade}</b><span><b>{o.fixture}</b> · {o.label} a <b>{o.odds.toFixed(2)}</b> su {o.bookmaker.split(' / ')[0]} → punta al massimo <b>{money(stakeOf(o.units))}</b></span></p>)}</div></div>}
          <div className="tcx-legend">
            <div className="g-A"><b>A</b><span><strong>Giocala, puntata piena.</strong> Tutti i 7 controlli superati.</span></div>
            <div className="g-B"><b>B</b><span><strong>Giocala con metà puntata.</strong> Valore buono, ma un controllo non critico manca (es. assenza pesante o modello in disaccordo): più incertezza, meno rischio.</span></div>
            <div className="g-C"><b>C</b><span><strong>Non giocare.</strong> Manca un controllo critico: valore, quota recente o storico negativo.</span></div>
          </div>
          {!list.length ? <div className="empty compact"><span className="empty-icon"><ListChecks /></span><h3>Nessuna opportunità in questo momento.</h3><p>È normale: un tipster gioca poco. Il prossimo controllo arriva con la scansione tra meno di 3 ore. Intanto guarda la lista “in osservazione” qui sotto.</p></div>
            : <div className="tc-opps">{list.map((o: any) => { const k = o.fixtureId + o.market, st = stakeOf(o.units), g = GRADE[o.grade], f = failed(o); return <article key={k} className={'tc-opp g-' + o.grade}>
              <div className={'tcx-ribbon g-' + o.grade}><b>{o.grade}</b><div><strong>{g[0]}</strong><small>{g[1]}</small></div>{I('opp')}</div>
              {o.reported && <p className="tcx-reported">Quota aggiornata alle {hm(o.reported.at)}: {o.reported.odds.toFixed(2)} (QUORUM aveva letto {o.reported.before.toFixed(2)}). Livello e valore ricalcolati.</p>}
              <div className="tc-opp-top"><div><small>{o.competition} · {when(o.kickoff)}</small><strong>{o.fixture}</strong></div><span className="tip-edge" title="Valore: quanto la quota paga più del giusto">valore {sg(o.edge)}</span></div>
              <div className="tcx-pick"><span className="tcx-esito"><small>Esito da giocare</small><b>{o.label}</b></span>
                <span><small>Quota</small><b>{o.odds.toFixed(2)}</b><em>{o.bookmaker}</em></span>
                <span><small>Quota giusta</small><b>{o.fair.toFixed(2)}</b><em>Pinnacle senza margine</em></span></div>
              {o.all && Object.keys(o.all).length > 1 && <div className="tcx-books"><small>Confronto bookmaker</small>{Object.entries(o.all as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([b, q], i) => <span key={b} className={i === 0 ? 'best' : ''}>{b === 'Lottomatica' ? 'Lottomatica / Planetwin' : b} <b>{q.toFixed(2)}</b></span>)}</div>}
              <div className={'tcx-stake g-' + o.grade}>{o.grade === 'C' ? <><strong>Non giocare</strong><small>{f.length ? 'Non superato: ' + f.join(', ') + '.' : g[2] + '.'}</small></>
                : <><div><small>Puntata massima</small><strong>{money(st)}</strong></div><div className="tcx-stake-u"><span>{o.units.toFixed(1).replace('.', ',')} unità {I('units')}</span><small>1 unità = 1% del tuo saldo{o.grade === 'B' ? ' · già dimezzata (livello B)' : ''}</small></div></>}</div>
              {o.grade === 'B' && f.length > 0 && <p className="tcx-why-b">Perché B: non superato “{f.join('”, “')}”. Tocca il controllo rosso per la spiegazione.</p>}
              <ul className="tc-checks">{o.checks.map((c: any) => <li key={c.id} className={c.ok === true ? 'ok' : c.ok === false ? 'ko' : 'na'} title={c.note} role="button" tabIndex={0} onClick={() => setInfoId(CK[c.id] ?? 'opp')}><i>{c.ok === true ? <Check size={13} /> : c.ok === false ? <X size={13} /> : '?'}</i>{c.label}</li>)}</ul>
              <button className="text-button" onClick={() => setOpen(open === k ? '' : k)}>{open === k ? 'Chiudi i dettagli' : 'Perché? Vedi i dettagli dei controlli'}</button>
              {open === k && <ul className="tc-notes">{o.checks.map((c: any) => <li key={c.id}><b>{c.label}</b>: {c.note}</li>)}</ul>}
              {onRecord && o.grade !== 'C' && playBox({ k, suggested: st, odds: o.odds, p: o.pTrue, report: o.fixtureId + ':' + o.market, record: (c, q) => onRecord([{ fixtureId: o.fixtureId, fixture: o.fixture, competition: o.competition, kickoff: o.kickoff, market: o.market, label: o.label, p: o.pTrue, odds: q }], c, 'value', 'tipster-centro') })}
            </article>; })}</div>}
          {(d.opportunities.doubles ?? []).length > 0 && <><h3 className="day-title">🎯 Doppie del metodo</h3>
            <p className="small-note">Due giocate di partite diverse che hanno superato la checklist, nella stessa schedina. Si vince solo se escono entrambe; la puntata è più bassa (massimo 1% del saldo) perché il rischio è più alto.</p>
            <div className="tc-opps">{d.opportunities.doubles.map((x: any) => { const st = stakeOf(x.units); return <article key={x.legs.map((l: any) => l.fixtureId + l.market).join()} className={'tc-opp g-' + x.grade}>
              <div className={'tcx-ribbon g-' + x.grade}><b>{x.grade}</b><div><strong>{x.grade === 'A' ? 'GIOCALA' : 'GIOCALA CON MEZZA PUNTATA'}</strong><small>Doppia · livello {x.grade}</small></div></div>
              {x.legs.map((l: any) => <div key={l.fixtureId} className="tcx-dleg"><div><small>{l.competition} · {when(l.kickoff)}</small><strong>{l.fixture}</strong></div><span><b>{l.label}</b><em>{l.odds.toFixed(2)} · {l.bookmaker.split(' / ')[0]}</em></span></div>)}
              <div className={'tcx-stake g-' + x.grade}><div><small>Quota totale · valore {sg(x.edge)}</small><strong>{x.odds.toFixed(2)}</strong></div><div className="tcx-stake-u"><small>Puntata massima</small><span>{money(st)} · {x.units.toFixed(1).replace('.', ',')} unità</span></div></div>
              {onRecord && playBox({ k: 'd:' + x.legs.map((l: any) => l.fixtureId + l.market).join(), suggested: st, odds: x.odds, p: x.p, record: (c, q) => onRecord(x.legs.map((l: any, i: number) => ({ fixtureId: l.fixtureId, fixture: l.fixture, competition: l.competition, kickoff: l.kickoff, market: l.market, label: l.label, p: l.pTrue, odds: i === 0 ? Math.round(l.odds * q / x.odds * 1000) / 1000 : l.odds })), c, 'value', 'tipster-centro-doppia') })}
            </article>; })}</div></>}
          {d.opportunities.watch.length > 0 && <><h3 className="day-title">👀 In osservazione {I('watch')}</h3>
            <p className="small-note">Pinnacle si sta muovendo e la quota italiana è vicina al valore (0–3%). Se il bookmaker italiano non si adegua e Pinnacle continua, diventano opportunità al prossimo controllo.</p>
            <div className="tc-table"><table><thead><tr><th>Partita</th><th>Esito</th><th>Probabilità vera</th><th>Quota italiana</th><th>Valore</th></tr></thead><tbody>{d.opportunities.watch.map((m: any) => <tr key={m.fixtureId + m.market}><td>{m.fixture}<small>{when(m.kickoff)}</small></td><td>{m.label}</td><td>{percent(m.pOpen, 0)} → <b>{percent(m.pNow, 0)}</b></td><td>{m.it ? m.it.odds.toFixed(2) + ' ' + m.it.book : '—'}</td><td className={cls(m.edge)}>{sg(m.edge)}</td></tr>)}</tbody></table></div></>}
        </section>; })()}

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
