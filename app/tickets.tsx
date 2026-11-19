'use client';
import { useEffect, useState } from 'react';
import { FlaskConical, Info, RefreshCw, Ticket as TicketIcon } from 'lucide-react';
import { money, percent } from '../lib/math';
import type { Selection } from '../lib/types';
import type { Ticket } from '../lib/tickets';

const when = (s: string) => new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });

function TicketCard({ t, equityCents, onLab }: { t: Ticket; equityCents: number; onLab: (s: Selection[]) => void }) {
  const raw = Math.floor(equityCents * (t.kind === 'bomba' ? 0.002 : t.kelly) / 100) * 100, stake = t.kind === 'bomba' || raw > 0 ? Math.max(200, raw) : 0;
  return <article className={'value-card ticket ' + t.kind}>
    <div className="value-head"><span>{t.title}</span><b className={t.ev > 0 ? 'edge' : 'edge neutral'}>{t.ev > 0 ? '+' + percent(t.ev) + ' valore' : 'valore ' + percent(t.ev)}</b></div>
    <p className="small-note">{t.description}</p>
    <ul className="legs">{t.legs.map(l => <li key={l.fixtureId + l.market}><div><strong>{l.fixture}</strong><small>{l.competition} · {when(l.kickoff)}</small></div><div className="leg-pick"><b>{l.label}</b><span>{l.odds.toFixed(2)}</span><small>{percent(l.p, 0)}</small></div></li>)}</ul>
    <div className="value-pick"><strong>Quota totale</strong><span className="odds">{t.odds.toFixed(2)}</span><small>probabilità {percent(t.p, t.p < 0.1 ? 1 : 0)}</small></div>
    <p className="small-note">{t.kind === 'bomba' ? 'Puntata indicativa ' + money(stake) + ': piccola, è una giocata da sogno.' : stake > 0 ? 'Puntata indicativa ' + money(stake) + ' (' + percent(t.kelly) + ' del capitale).' : 'Valore atteso non positivo: se la giochi, punta il minimo.'} Quote migliori: {[...new Set(t.legs.map(l => l.bookmaker))].join(', ')}.</p>
    <button className="text-button" onClick={() => onLab(t.legs.map(l => ({ fixtureId: l.fixtureId, fixture: l.fixture, market: l.market, label: l.label, p: l.p, odds: l.odds })))}><FlaskConical size={15} />Analizza nel Laboratorio</button>
  </article>;
}

export function TicketsView({ equityCents, onLab, notify }: { equityCents: number; onLab: (s: Selection[]) => void; notify: (m: string) => void }) {
  const [data, setData] = useState<{ run: any; singles: Ticket[]; tickets: Ticket[]; bomb: Ticket | null } | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [scanning, setScanning] = useState(false);
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
        {data.bomb && <><h3 className="day-title">💣 Bomba della settimana</h3><div className="value-list bomb-list"><TicketCard t={data.bomb} equityCents={equityCents} onLab={onLab} /></div></>}
        <h3 className="day-title">Multiple</h3>
        {data.tickets.length ? <div className="value-list">{data.tickets.map(t => <TicketCard key={t.kind} t={t} equityCents={equityCents} onLab={onLab} />)}</div> : <p className="small-note">Nessuna combinazione rispetta i criteri con le partite di oggi.</p>}
        <h3 className="day-title">Raddoppi con la singola</h3>
        {data.singles.length ? <div className="value-list">{data.singles.map((t, i) => <TicketCard key={i} t={t} equityCents={equityCents} onLab={onLab} />)}</div> : <p className="small-note">Nessuna singola a quota 2 con probabilità sufficiente.</p>}
      </>}
    <p className="footnote">Probabilità = stima QUORUM (modello + mercato). Le probabilità delle multiple si moltiplicano: più eventi aggiungi, più cala la probabilità di vincere e più margine guadagna il bookmaker. Le quote indicate sono le migliori trovate, anche su bookmaker diversi: verifica quella del tuo prima di giocare.</p>
  </>;
}
