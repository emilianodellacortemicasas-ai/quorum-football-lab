'use client';
import { useEffect, useState } from 'react';
import { Check, Copy, FlaskConical, Info, RefreshCw, Ticket as TicketIcon } from 'lucide-react';
import { money, percent } from '../lib/math';
import type { RecordPlay, Selection } from '../lib/types';
import type { SystemTicket, Ticket } from '../lib/tickets';
import { Count, Ring } from './motion';

const when = (s: string) => new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });

type Cal = { backtestSamples: number; liveSamples: number; backtestAt: string | null } | null;
type Hist = { weeks: number; matches: number; testDays: number; at: string; byKind: { kind: string; title: string; n: number; won: number; hit: number; expected: number; roi: number; avgOdds: number }[] } | null;
type Track = { kind: string; n: number; won: number; hit: number | null; expectedHit: number | null }[];
const pc = (p: number) => percent(p, p < 0.1 ? 1 : 0);
// Reliability label: how often a ticket like this is expected to win, in plain words.
const verdict = (p: number) => p >= 0.6 ? 'alta' : p >= 0.35 ? 'media' : p >= 0.12 ? 'bassa' : 'molto bassa';
const oneIn = (p: number) => p >= 0.5 ? 'vince circa ' + Math.round(p * 10) + ' volte su 10' : 'vince circa 1 volta su ' + Math.max(2, Math.round(1 / p));

function TicketCard({ t, equityCents, onLab, cal, track, history, role = 'core', onRecord }: { t: Ticket; equityCents: number; onLab: (s: Selection[]) => void; cal?: Cal; track?: Track; history?: Hist; role?: 'core' | 'min'; onRecord?: RecordPlay }) {
  const h = history?.byKind.find(x => x.kind === t.kind);
  const kindBase = t.kind.replace(/-\d+$/, ''), real = track?.filter(x => x.kind === t.kind || x.kind.replace(/-\d+$/, '') === kindBase).reduce((a, x) => ({ n: a.n + x.n, won: a.won + x.won, exp: a.exp + (x.expectedHit ?? 0) * x.n }), { n: 0, won: 0, exp: 0 });
  const raw = Math.floor(equityCents * t.kelly / 100) * 100, stake = role === 'min' ? 200 : t.kelly > 0 ? Math.max(200, raw) : 0, started = (t as any).started;
  return <article className={'value-card ticket ' + t.kind}>
    <div className="value-head"><span>{t.title}</span><b className={t.ev > 0 ? 'edge' : 'edge neutral'}>{t.ev > 0 ? '+' + percent(t.ev) + ' valore' : 'valore ' + percent(t.ev)}</b></div>
    <div className={'reliability r-' + verdict(t.p).replace(' ', '-')}>
      <div><Ring p={t.p} size={58} /><span>Affidabilità misurata</span><strong><Count value={t.p} format={pc} /></strong><em>{verdict(t.p)} · {oneIn(t.p)}</em></div>
      <small>Intervallo probabile {pc(t.low)}–{pc(t.high)}.{real && real.n ? ' Schedine QUORUM già chiuse: ' + real.won + ' vinte su ' + real.n + '.' : ''}</small>
      {h && h.n >= 5 && <small className="history-line">Storico con quote reali: {h.won} vinte su {h.n}.</small>}
    </div>
    <p className="small-note">{t.description}</p>
    <ul className="legs">{t.legs.map(l => <li key={l.fixtureId + l.market}><div><strong>{l.fixture}</strong><small>{l.competition} · {when(l.kickoff)}</small></div><div className="leg-pick"><b>{l.label}</b><span>{l.odds.toFixed(2)}</span><small>{percent(l.p, 0)}{l.italian ? '' : ' · estera'}</small></div></li>)}</ul>
    <div className="value-pick"><strong>Quota totale</strong><span className="odds"><Count value={t.odds} format={v => v.toFixed(2)} /></span><small>{t.italian ? 'su Lottomatica / Planetwin365' : 'quote migliori (anche estere)'}</small></div>
    <p className={'stake-line ' + (role === 'min' ? 'min' : stake > 0 ? 'go' : 'skip')}>{started ? 'Già iniziata: non più giocabile, la vedi per seguirne l’esito.' : role === 'min' ? 'Puntata minima: ' + money(stake) + '. Giocata da sogno, non serve a far crescere il capitale.' : stake > 0 ? 'Puntata consigliata: ' + money(stake) + ' (' + percent(Math.max(t.kelly, 200 / Math.max(equityCents, 1))) + ' del capitale).' : 'Oggi la quota non ripaga il rischio: per far crescere il capitale meglio saltarla.'}</p>
    <p className="small-note">{t.italian ? 'Tutte le quote sono di Lottomatica / Planetwin365.' : 'Quote: ' + [...new Set(t.legs.map(l => l.bookmaker))].join(', ') + (t.legs.some(l => !l.italian) ? ' (alcuni esiti non sono quotati da Lottomatica / Planetwin365).' : '.')} Gioca solo se la quota sul tuo conto è uguale o più alta.</p>
    {onRecord && !(t as any).started && <button className="secondary played-button" onClick={() => onRecord(t.legs, stake || 200, 'schedina', t.kind)}><Check size={15} />L’ho giocata ({money(stake || 200)})</button>}
    <button className="text-button" onClick={() => onLab(t.legs.map(l => ({ fixtureId: l.fixtureId, fixture: l.fixture, market: l.market, label: l.label, p: l.p, odds: l.odds, competition: l.competition, kickoff: l.kickoff })))}><FlaskConical size={15} />Analizza nel Laboratorio</button>
  </article>;
}

function SystemCard({ x, onLab, onRecord, notify }: { x: SystemTicket; onLab?: (s: Selection[], classes: { k: number; unitCents: number }[]) => void; onRecord?: (legs: any[], classes: { k: number; unitCents: number }[]) => Promise<boolean>; notify: (m: string) => void }) {
  const [unit, setUnit] = useState('1'), u = Math.max(0.05, Number(unit.replace(',', '.')) || 1), f = u;
  const n = x.legs.length, started = x.legs.some(l => Date.parse(l.kickoff) <= Date.now());
  const classes = x.classes.map(c => ({ k: c.k, unitCents: Math.round(u * 100) }));
  const copy = () => { const t = x.name + '\n' + x.legs.map(l => '• ' + l.fixture + ' — ' + l.label + ' @ ' + l.odds.toFixed(2)).join('\n') + '\nClassi: ' + x.classes.map(c => (c.k === n ? 'Multipla' : ['', 'Singole', 'Doppie', 'Triple', 'Quadruple', 'Quintuple'][c.k]) + ' ' + money(Math.round(u * 100)) + ' a combinazione').join(', ') + '\nImporto sistema ' + money(Math.round(x.costCents * f)); navigator.clipboard?.writeText(t).then(() => notify('Sistema copiato: incollalo dove vuoi.'), () => notify('Copia non riuscita.')); };
  return <article className="value-card ticket system-card">
    <div className="value-head"><span>{x.title}</span><b className="edge">{percent(x.pProfit, 0)} profitto</b></div>
    <p className="sys-name">{x.name}</p>
    <ul className="legs">{x.legs.map(l => <li key={l.fixtureId}><div><strong>{l.fixture}</strong><small>{l.competition} · {when(l.kickoff)}</small></div><div className="leg-pick"><b>{l.label}</b><span>{l.odds.toFixed(2)}</span><small>{percent(l.p, 0)}</small></div></li>)}</ul>
    <div className="sys-summary"><div><span>Combinazioni</span><b>{x.tickets}</b></div><div><span>Importo sistema</span><b>{money(Math.round(x.costCents * f))}</b></div><div><span>Vincita min</span><b className="positive">{money(Math.round(x.minWinCents * f))}</b></div><div><span>Vincita max</span><b className="positive">{money(Math.round(x.maxReturnCents * f))}</b></div></div>
    <div className={'sys-breakeven' + (x.breakEven === null ? ' no' : '')}>{x.breakEven === null ? 'Non va mai in profitto.' : x.breakEven === n ? 'In profitto solo se vincono tutte e ' + n + '.' : <>In profitto se ne vincono <b>almeno {x.breakEven} su {n}</b>: puoi sbagliarne {n - x.breakEven}.</>}</div>
    <label className="sys-unit">Puntata per combinazione (€)<input inputMode="decimal" value={unit} onChange={e => setUnit(e.target.value)} /></label>
    <div className="play-actions"><button className="share-chip on" onClick={copy}><Copy size={13} />Copia</button>
      {onLab && <button className="share-chip" onClick={() => onLab(x.legs.map(l => ({ fixtureId: l.fixtureId, fixture: l.fixture, market: l.market, label: l.label, p: l.p, odds: l.odds, competition: l.competition, kickoff: l.kickoff })), classes)}><FlaskConical size={13} />Apri nel Laboratorio</button>}
      {onRecord && !started && <button className="share-chip" onClick={() => onRecord(x.legs, classes)}><Check size={13} />L’ho giocato ({money(Math.round(x.costCents * f))})</button>}</div>
  </article>;
}

export function TicketsView({ equityCents, onLab, notify, onRecord, onLabSystem, onRecordSystem }: { equityCents: number; onLab: (s: Selection[]) => void; notify: (m: string) => void; onRecord?: RecordPlay; onLabSystem?: (s: Selection[], classes: { k: number; unitCents: number }[]) => void; onRecordSystem?: (legs: any[], classes: { k: number; unitCents: number }[]) => Promise<boolean> }) {
  const [data, setData] = useState<{ run: any; singles: Ticket[]; tickets: Ticket[]; bomb: Ticket | null; probable?: Ticket[]; sure?: Ticket[]; banded?: Ticket[]; systems?: SystemTicket[]; bombs?: Ticket[]; calibration?: Cal; track?: Track; history?: Hist } | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [scanning, setScanning] = useState(false);
  async function load() {
    setLoading(true); setError('');
    try { const r = await fetch('/api/scanner?view=tickets', { cache: 'no-store' }); const d: any = await r.json(); if (!r.ok) throw new Error(d.error); setData(d); }
    catch (e) { setError(e instanceof Error ? e.message : 'Schedine non disponibili.'); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function scan() {
    setScanning(true);
    try { const r = await fetch('/api/scanner', { method: 'POST' }); const d: any = await r.json(); if (!r.ok) throw new Error(d.error); await load(); notify('Schedine aggiornate.'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Aggiornamento non riuscito.'); } finally { setScanning(false); }
  }
  return <>
    <div className="page-heading"><div><p className="eyebrow">SCHEDINE</p><h1>Pronte da giocare<span>.</span></h1><p>Obiettivo: far crescere il capitale. Prima le schedine con lo storico migliore, poi le giocate da sogno a puntata minima.</p></div>
      <button className="secondary" onClick={scan} disabled={scanning}><RefreshCw size={16} className={scanning ? 'spin' : ''} />{scanning ? 'Aggiornamento…' : 'Aggiorna ora'}</button></div>
    {loading ? <div className="empty"><span className="empty-icon"><RefreshCw className="spin" /></span><h3>Compongo le schedine…</h3></div>
      : error ? <div className="empty"><span className="empty-icon"><Info /></span><h3>Schedine non disponibili</h3><p>{error}</p></div>
      : !data?.run ? <div className="empty"><span className="empty-icon"><TicketIcon /></span><h3>Nessun dato ancora.</h3><p>Premi “Aggiorna ora”.</p></div>
      : <>
        {(() => {
          const card = (t: Ticket, role: 'core' | 'min' = 'core') => <TicketCard key={t.kind + t.legs.map(l => l.fixtureId + l.market).join()} t={t} equityCents={equityCents} onLab={onLab} cal={data.calibration} track={data.track} history={data.history} role={role} onRecord={onRecord} />;
          const bands = ['80', '70', '60'].map(b => ({ b, label: b === '80' ? '80–90%' : b === '70' ? '70–80%' : '60–70%', list: (data.banded || []).filter(t => t.kind.endsWith('-' + b)) })).filter(x => x.list.length);
          return <>
            {data.sure && data.sure.length > 0 && <>
              <h3 className="day-title">🛡️ Raddoppi</h3>
              <p className="small-note">Due squadre, quota circa 2: i due esiti più affidabili che insieme raddoppiano la puntata. Quote Lottomatica / Planetwin365, partite diverse tra una schedina e l’altra.</p>
              <div className="value-list">{data.sure.map(t => card(t))}</div>
            </>}
            {bands.length > 0 && <>
              <h3 className="day-title">🎯 Schedine da 3 e 5 squadre</h3>
              <p className="small-note">Ogni esito ha la probabilità della fascia indicata; dentro la fascia QUORUM sceglie quelli con più valore sulle quote italiane. Più alta la fascia, più sicura la schedina e più bassa la quota.</p>
              {bands.map(x => <div key={x.b} className="band-block"><p className={'band-tag b' + x.b}>Esiti al {x.label}</p><div className="value-list">{x.list.map(t => card(t))}</div></div>)}
            </>}
            {data.systems && data.systems.length > 0 && <>
              <h3 className="day-title">🧮 Sistemi pronti</h3>
              <p className="small-note">Un sistema per ogni giorno di partite, con la struttura che dà la probabilità di profitto più alta. Copialo sul bookmaker, aprilo nel Laboratorio o registralo.</p>
              <div className="value-list">{data.systems.map(x => <SystemCard key={x.kind} x={x} onLab={onLabSystem} onRecord={onRecordSystem} notify={notify} />)}</div>
            </>}
            {data.bombs && data.bombs.length > 0 && <>
              <h3 className="day-title">💣 Bombe</h3>
              <p className="small-note">Una per ogni giornata di partite: quota da 10 a 100 in base a quante partite ci sono. Per sognare, sempre a puntata minima.</p>
              <div className="value-list bomb-list">{data.bombs.map(t => card(t, 'min'))}</div>
            </>}
            {!data.sure?.length && !bands.length && !data.systems?.length && !data.bombs?.length && <p className="small-note">Nessuna schedina rispetta i criteri con le partite dei prossimi giorni.</p>}
          </>;
        })()}
      </>}
    <p className="footnote">Affidabilità misurata = probabilità che la schedina vinca, corretta con il backtest (ogni settimana QUORUM riverifica il modello su circa 150 giorni di partite) e, man mano che le partite finiscono, con i risultati reali delle sue previsioni. L’intervallo indica l’incertezza della misura. Probabilità = stima QUORUM (modello + mercato). Le probabilità delle multiple si moltiplicano: più eventi aggiungi, più cala la probabilità di vincere e più margine guadagna il bookmaker. Le quote indicate sono le migliori trovate, anche su bookmaker diversi: verifica quella del tuo prima di giocare.</p>
  </>;
}
