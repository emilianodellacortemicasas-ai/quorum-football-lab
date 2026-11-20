'use client';
import { useEffect, useState } from 'react';
import { Check, FlaskConical, Info, RefreshCw, Ticket as TicketIcon } from 'lucide-react';
import { money, percent } from '../lib/math';
import type { RecordPlay, Selection } from '../lib/types';
import type { Ticket } from '../lib/tickets';
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

export function TicketsView({ equityCents, onLab, notify, onRecord }: { equityCents: number; onLab: (s: Selection[]) => void; notify: (m: string) => void; onRecord?: RecordPlay }) {
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
    <div className="page-heading"><div><p className="eyebrow">SCHEDINE</p><h1>Pronte da giocare<span>.</span></h1><p>Obiettivo: far crescere il capitale. Prima le schedine con lo storico migliore, poi le giocate da sogno a puntata minima.</p></div>
      <button className="secondary" onClick={scan} disabled={scanning}><RefreshCw size={16} className={scanning ? 'spin' : ''} />{scanning ? 'Aggiornamento…' : 'Aggiorna ora'}</button></div>
    {loading ? <div className="empty"><span className="empty-icon"><RefreshCw className="spin" /></span><h3>Compongo le schedine…</h3></div>
      : error ? <div className="empty"><span className="empty-icon"><Info /></span><h3>Schedine non disponibili</h3><p>{error}</p></div>
      : !data?.run ? <div className="empty"><span className="empty-icon"><TicketIcon /></span><h3>Nessun dato ancora.</h3><p>Premi “Aggiorna ora”.</p></div>
      : <>
        {(() => {
          const p3 = data.probable?.find(t => t.kind === 'probabile-3'), rm = data.tickets.find(t => t.kind === 'raddoppio-multipla'), q3 = data.tickets.find(t => t.kind === 'quota10-3');
          const card = (t: Ticket, role: 'core' | 'min' = 'core') => <TicketCard key={t.kind + t.legs.map(l => l.fixtureId + l.market).join()} t={t} equityCents={equityCents} onLab={onLab} cal={data.calibration} track={data.track} history={data.history} role={role} onRecord={onRecord} />;
          return <>
            <h3 className="day-title">📈 Per far crescere il capitale</h3>
            <p className="small-note">Le schedine con lo storico migliore. Giocale con la puntata consigliata, calcolata sul tuo capitale: quando una non ripaga il rischio, QUORUM ti dice di saltarla.</p>
            <div className="value-list">{p3 && card(p3)}{rm && card(rm)}</div>
            {!p3 && !rm && <p className="small-note">Oggi nessuna combinazione rispetta i criteri.</p>}
            <h3 className="day-title">🎯 Raddoppi singoli di valore</h3>
            <p className="small-note">Una sola partita a quota circa 2, scelta tra le più probabili dove la quota di Lottomatica / Planetwin365 paga più del dovuto.</p>
            {data.singles.length ? <div className="value-list">{data.singles.map(t => card(t))}</div> : <p className="small-note">Oggi nessuna partita a quota 2 con valore e probabilità sufficienti.</p>}
            <h3 className="day-title">🎲 A puntata minima</h3>
            <p className="small-note">Per sognare, non per costruire il capitale: sempre la giocata minima.</p>
            <div className="value-list bomb-list">{data.bomb && card(data.bomb, 'min')}{q3 && card(q3, 'min')}</div>
          </>;
        })()}
      </>}
    <p className="footnote">Affidabilità misurata = probabilità che la schedina vinca, corretta con il backtest (ogni settimana QUORUM riverifica il modello su circa 150 giorni di partite) e, man mano che le partite finiscono, con i risultati reali delle sue previsioni. L’intervallo indica l’incertezza della misura. Probabilità = stima QUORUM (modello + mercato). Le probabilità delle multiple si moltiplicano: più eventi aggiungi, più cala la probabilità di vincere e più margine guadagna il bookmaker. Le quote indicate sono le migliori trovate, anche su bookmaker diversi: verifica quella del tuo prima di giocare.</p>
  </>;
}
