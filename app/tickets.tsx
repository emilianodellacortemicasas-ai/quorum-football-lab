'use client';
import { useEffect, useState } from 'react';
import { FlaskConical, Info, RefreshCw, Ticket as TicketIcon } from 'lucide-react';
import { money, percent } from '../lib/math';
import type { Selection } from '../lib/types';
import type { Ticket } from '../lib/tickets';

const when = (s: string) => new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });

type Cal = { backtestSamples: number; liveSamples: number; backtestAt: string | null } | null;
type Hist = { weeks: number; matches: number; testDays: number; at: string; byKind: { kind: string; title: string; n: number; won: number; hit: number; expected: number; roi: number; avgOdds: number }[] } | null;
type Track = { kind: string; n: number; won: number; hit: number | null; expectedHit: number | null }[];
const pc = (p: number) => percent(p, p < 0.1 ? 1 : 0);
// Reliability label: how often a ticket like this is expected to win, in plain words.
const verdict = (p: number) => p >= 0.6 ? 'alta' : p >= 0.35 ? 'media' : p >= 0.12 ? 'bassa' : 'molto bassa';
const oneIn = (p: number) => p >= 0.5 ? 'vince circa ' + Math.round(p * 10) + ' volte su 10' : 'vince circa 1 volta su ' + Math.max(2, Math.round(1 / p));

function TicketCard({ t, equityCents, onLab, cal, track, history }: { t: Ticket; equityCents: number; onLab: (s: Selection[]) => void; cal?: Cal; track?: Track; history?: Hist }) {
  const h = history?.byKind.find(x => x.kind === t.kind);
  const kindBase = t.kind.replace(/-\d+$/, ''), real = track?.filter(x => x.kind === t.kind || x.kind.replace(/-\d+$/, '') === kindBase).reduce((a, x) => ({ n: a.n + x.n, won: a.won + x.won, exp: a.exp + (x.expectedHit ?? 0) * x.n }), { n: 0, won: 0, exp: 0 });
  const raw = Math.floor(equityCents * (t.kind === 'bomba' ? 0.002 : t.kelly) / 100) * 100, stake = t.kind === 'bomba' || t.kelly > 0 ? Math.max(200, raw) : 0;
  return <article className={'value-card ticket ' + t.kind}>
    <div className="value-head"><span>{t.title}</span><b className={t.ev > 0 ? 'edge' : 'edge neutral'}>{t.ev > 0 ? '+' + percent(t.ev) + ' valore' : 'valore ' + percent(t.ev)}</b></div>
    <div className={'reliability r-' + verdict(t.p).replace(' ', '-')}>
      <div><span>Affidabilità misurata</span><strong>{pc(t.p)}</strong><em>{verdict(t.p)} · {oneIn(t.p)}</em></div>
      <small>Intervallo probabile {pc(t.low)}–{pc(t.high)}. {(t as any).factor && Math.abs((t as any).factor - 1) > 0.02 ? 'Corretta del ' + ((t as any).factor > 1 ? '+' : '') + Math.round(((t as any).factor - 1) * 100) + '% con lo storico reale di questo tipo di schedina. ' : ''}Misurata su {cal?.backtestSamples ? cal.backtestSamples.toLocaleString('it-IT') + ' esiti del backtest' : 'stima del modello'}{cal?.liveSamples ? ' e ' + cal.liveSamples.toLocaleString('it-IT') + ' esiti reali chiusi' : ''}.{real && real.n ? ' Schedine di questo tipo già chiuse: ' + real.won + ' vinte su ' + real.n + ' (attese ' + Math.round(real.exp) + ').' : ''}</small>
      {h && h.n >= 5 && <small className="history-line"><b>Nel passato, con quote reali:</b> vinte {h.won} su {h.n} ({percent(h.hit, 0)}; QUORUM ne prevedeva {percent(h.expected, 0)}), rendimento {h.roi >= 0 ? '+' : ''}{percent(h.roi, 0)} sulla puntata.</small>}
    </div>
    <p className="small-note">{t.description}</p>
    <ul className="legs">{t.legs.map(l => <li key={l.fixtureId + l.market}><div><strong>{l.fixture}</strong><small>{l.competition} · {when(l.kickoff)}</small></div><div className="leg-pick"><b>{l.label}</b><span>{l.odds.toFixed(2)}</span><small>{percent(l.p, 0)}{l.italian ? '' : ' · estera'}</small></div></li>)}</ul>
    <div className="value-pick"><strong>Quota totale</strong><span className="odds">{t.odds.toFixed(2)}</span><small>{t.italian ? 'su Lottomatica / Planetwin365' : 'quote migliori (anche estere)'}</small></div>
    <p className="small-note">{t.kind === 'bomba' ? 'Puntata indicativa ' + money(stake) + ': piccola, è una giocata da sogno.' : stake > 0 ? 'Puntata indicativa ' + money(stake) + ' (' + percent(t.kelly) + ' del capitale).' : 'Valore atteso non positivo: se la giochi, punta il minimo.'} {t.italian ? 'Tutte le quote sono di Lottomatica / Planetwin365.' : 'Quote: ' + [...new Set(t.legs.map(l => l.bookmaker))].join(', ') + (t.legs.some(l => !l.italian) ? ' (alcuni esiti non sono quotati da Lottomatica / Planetwin365).' : '.')} Il valore misura quanto paga la quota rispetto alla probabilità: conta, ma leggi prima l’affidabilità.</p>
    <button className="text-button" onClick={() => onLab(t.legs.map(l => ({ fixtureId: l.fixtureId, fixture: l.fixture, market: l.market, label: l.label, p: l.p, odds: l.odds })))}><FlaskConical size={15} />Analizza nel Laboratorio</button>
  </article>;
}

export function TicketsView({ equityCents, onLab, notify }: { equityCents: number; onLab: (s: Selection[]) => void; notify: (m: string) => void }) {
  const [data, setData] = useState<{ run: any; singles: Ticket[]; tickets: Ticket[]; bomb: Ticket | null; probable?: Ticket[]; calibration?: Cal; track?: Track; history?: Hist } | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [scanning, setScanning] = useState(false);
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
    <div className="page-heading"><div><p className="eyebrow">SCHEDINE</p><h1>Pronte da giocare<span>.</span></h1><p>Raddoppi e multiple composti in automatico dai pronostici della settimana. Un solo esito per partita.</p></div>
      <button className="secondary" onClick={scan} disabled={scanning}><RefreshCw size={16} className={scanning ? 'spin' : ''} />{scanning ? 'Aggiornamento…' : 'Aggiorna ora'}</button></div>
    {loading ? <div className="empty"><span className="empty-icon"><RefreshCw className="spin" /></span><h3>Compongo le schedine…</h3></div>
      : error ? <div className="empty"><span className="empty-icon"><Info /></span><h3>Schedine non disponibili</h3><p>{error}</p></div>
      : !data?.run ? <div className="empty"><span className="empty-icon"><TicketIcon /></span><h3>Nessun dato ancora.</h3><p>Premi “Aggiorna ora”.</p></div>
      : <>
        {data.history && data.history.byKind.length > 0 && <section className="panel history-panel"><h3>Come sarebbero andate queste schedine nel passato</h3><p className="small-note">Backtest con quote reali (media dei bookmaker, football-data.co.uk): {data.history.weeks} settimane, {data.history.matches} partite, stesse regole di oggi e solo dati disponibili prima di ogni partita. Mercati del backtest: 1X2, doppia chance, Over/Under 2,5.</p>
          <table><thead><tr><th>Schedina</th><th>Giocate</th><th>Vinte</th><th>Prevista</th><th>Rendimento</th></tr></thead><tbody>{[...data.history.byKind].sort((a, b) => b.hit - a.hit).map(k => <tr key={k.kind}><td>{k.title}<small> · quota media {k.avgOdds.toFixed(2)}</small></td><td>{k.n}</td><td><b>{percent(k.hit, 0)}</b></td><td>{percent(k.expected, 0)}</td><td className={k.roi >= 0 ? 'pos' : 'neg'}>{k.roi >= 0 ? '+' : ''}{percent(k.roi, 0)}</td></tr>)}</tbody></table>
          <p className="small-note">“Vinte” è la percentuale reale, “Prevista” quella che QUORUM stimava. Se sono vicine, l’affidabilità è credibile. Rendimento = guadagno medio per euro puntato.</p></section>}
        {data.bomb && <><h3 className="day-title">💣 Bomba della settimana</h3><div className="value-list bomb-list"><TicketCard t={data.bomb} equityCents={equityCents} onLab={onLab} cal={data.calibration} track={data.track} history={data.history} /></div></>}
        {data.probable && data.probable.length > 0 && <><h3 className="day-title">🎯 La multipla più probabile</h3><p className="small-note">La combinazione con la probabilità statistica di successo più alta: più eventi aggiungi, più sale la quota e scende la probabilità.</p><div className="value-list probable-list">{data.probable.map(t => <TicketCard key={t.kind} t={t} equityCents={equityCents} onLab={onLab} cal={data.calibration} track={data.track} history={data.history} />)}</div></>}
        <h3 className="day-title">Multiple</h3>
        {data.tickets.length ? <div className="value-list">{data.tickets.map(t => <TicketCard key={t.kind} t={t} equityCents={equityCents} onLab={onLab} cal={data.calibration} track={data.track} history={data.history} />)}</div> : <p className="small-note">Nessuna combinazione rispetta i criteri con le partite di oggi.</p>}
        <h3 className="day-title">Raddoppi con la singola</h3>
        {data.singles.length ? <div className="value-list">{data.singles.map((t, i) => <TicketCard key={i} t={t} equityCents={equityCents} onLab={onLab} cal={data.calibration} track={data.track} history={data.history} />)}</div> : <p className="small-note">Nessuna singola a quota 2 con probabilità sufficiente.</p>}
      </>}
    <p className="footnote">Affidabilità misurata = probabilità che la schedina vinca, corretta con il backtest (ogni settimana QUORUM riverifica il modello su circa 150 giorni di partite) e, man mano che le partite finiscono, con i risultati reali delle sue previsioni. L’intervallo indica l’incertezza della misura. Probabilità = stima QUORUM (modello + mercato). Le probabilità delle multiple si moltiplicano: più eventi aggiungi, più cala la probabilità di vincere e più margine guadagna il bookmaker. Le quote indicate sono le migliori trovate, anche su bookmaker diversi: verifica quella del tuo prima di giocare.</p>
  </>;
}
