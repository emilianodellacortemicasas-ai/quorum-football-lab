'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, Info, RefreshCw, TrendingUp } from 'lucide-react';
import { money, percent } from '../lib/math';

type Pick = { id: string; fixture_id: string; fixture: string; competition: string; kickoff: string; market: string; label: string; p_model: number; p_market: number; p_blend: number; best_odds: number; bookmaker: string; books: number; edge: number; kelly: number };
type Run = { started_at: string; finished_at: string | null; status: string; fixtures: number; matched: number; modelled: number; picks: number; odds_remaining: number | null; message: string | null };
type Data = { run: Run | null; last: Run | null; picks: Pick[]; evaluated: number };

const when = (s: string) => new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const signed = (p: number) => (p >= 0 ? '+' : '') + percent(p);

export function ValueView({ equityCents, onOpen, notify }: { equityCents: number; onOpen: (fixtureId: string) => void; notify: (m: string) => void }) {
  const [data, setData] = useState<Data | null>(null), [loading, setLoading] = useState(true), [scanning, setScanning] = useState(false), [error, setError] = useState('');
  const [league, setLeague] = useState('Tutte');
  async function load() {
    setLoading(true); setError('');
    try { const r = await fetch('/api/scanner', { cache: 'no-store' }); const d: any = await r.json(); if (!r.ok) throw new Error(d.error); setData(d); }
    catch (e) { setError(e instanceof Error ? e.message : 'Scanner non disponibile.'); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function scan() {
    setScanning(true);
    try { const r = await fetch('/api/scanner', { method: 'POST' }); const d: any = await r.json(); if (!r.ok) throw new Error(d.error); setData(d); notify('Scansione completata.'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Scansione non riuscita.'); } finally { setScanning(false); }
  }
  const picks = (data?.picks || []).filter(p => league === 'Tutte' || p.competition === league);
  const leagues = ['Tutte', ...new Set((data?.picks || []).map(p => p.competition))];
  const run = data?.run, last = data?.last;
  return <>
    <div className="page-heading"><div><p className="eyebrow">VALUE SCANNER</p><h1>Dove la quota paga di più<span>.</span></h1><p>Ogni mattina QUORUM confronta il modello con le quote dei bookmaker europei sulle tue 6 competizioni.</p></div>
      <button className="secondary" onClick={scan} disabled={scanning}><RefreshCw size={16} className={scanning ? 'spin' : ''} />{scanning ? 'Scansione in corso…' : 'Aggiorna ora'}</button></div>
    {run && <section className="value-summary">
      <div><span>Ultima scansione</span><strong>{when(run.started_at)}</strong></div>
      <div><span>Partite nei prossimi 3 giorni</span><strong>{run.fixtures}</strong></div>
      <div><span>Con quote e modello</span><strong>{run.modelled}</strong></div>
      <div><span>Esiti valutati</span><strong>{data?.evaluated}</strong></div>
      <div><span>Giocate di valore</span><strong className="accent">{run.picks}</strong></div>
    </section>}
    {last && last.status === 'error' && <p className="value-warning"><Info size={15} />Ultimo tentativo non riuscito: {last.message}</p>}
    {run?.message && <p className="value-note"><Info size={15} />{run.message}</p>}
    {leagues.length > 2 && <div className="filters">{leagues.map(l => <button key={l} className={league === l ? 'selected' : ''} onClick={() => setLeague(l)}>{l}</button>)}</div>}
    {loading ? <div className="empty"><span className="empty-icon"><RefreshCw className="spin" /></span><h3>Carico le giocate…</h3></div>
      : error ? <div className="empty"><span className="empty-icon"><Info /></span><h3>Scanner non disponibile</h3><p>{error}</p></div>
      : !run ? <div className="empty"><span className="empty-icon"><TrendingUp /></span><h3>Nessuna scansione ancora.</h3><p>La prima parte in automatico domattina. Puoi avviarla adesso con “Aggiorna ora”.</p></div>
      : !picks.length ? <div className="empty"><span className="empty-icon"><TrendingUp /></span><h3>Nessuna giocata supera i filtri.</h3><p>È un risultato normale: QUORUM propone solo esiti con almeno il 3% di valore stimato, quote fino a 4,50, almeno 5 bookmaker e un modello non troppo lontano dal mercato.</p></div>
      : <div className="value-list">{picks.map(p => {
        const stake = Math.floor(equityCents * p.kelly / 100) * 100;
        return <article className="value-card" key={p.id}>
          <div className="value-head"><span>{p.competition} · {when(p.kickoff)}</span><b className="edge">{signed(p.edge)} valore</b></div>
          <h3>{p.fixture}</h3>
          <div className="value-pick"><strong>{p.label}</strong><span className="odds">{p.best_odds.toFixed(2)}</span><small>{p.bookmaker}</small></div>
          <dl><div><dt>Modello</dt><dd>{percent(p.p_model)}</dd></div><div><dt>Mercato</dt><dd>{percent(p.p_market)}</dd></div><div><dt>Stima QUORUM</dt><dd>{percent(p.p_blend)}</dd></div><div><dt>Puntata indicativa</dt><dd>{stake > 0 ? money(stake) : '—'}<small>{percent(p.kelly)} del capitale</small></dd></div></dl>
          <button className="text-button" onClick={() => onOpen(p.fixture_id)}>Apri la partita<ArrowRight size={15} /></button>
        </article>;
      })}</div>}
    <p className="footnote">Stima QUORUM = 35% modello + 65% consenso del mercato senza margine. Valore = stima × quota migliore − 1 (quota migliore entro il 6% della mediana: i prezzi isolati sono esclusi). Puntata indicativa = ¼ di Kelly, massimo 2% del capitale del portafoglio selezionato. Il modello non è ancora validato dal backtest: tratta queste giocate come segnali da verificare. Le quote cambiano: controlla quella del tuo bookmaker prima di giocare.</p>
  </>;
}
