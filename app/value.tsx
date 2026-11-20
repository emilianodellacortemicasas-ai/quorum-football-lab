'use client';
import type { RecordPlay } from '../lib/types';
import { useEffect, useState } from 'react';
import { Check, ArrowRight, Info, RefreshCw, TrendingUp } from 'lucide-react';
import { money, percent } from '../lib/math';
import { evaluateOutcome } from '../lib/scanner-contract';

type Pick = { id: string; fixture_id: string; fixture: string; competition: string; kickoff: string; market: string; label: string; p_model: number; p_market: number; p_blend: number; best_odds: number; bookmaker: string; books: number; edge: number; kelly: number; is_pick: number; it_odds?: number | null; it_book?: string | null; it_edge?: number | null; it_kelly?: number | null };
type Run = { started_at: string; finished_at: string | null; status: string; fixtures: number; matched: number; modelled: number; picks: number; odds_remaining: number | null; message: string | null };
type Data = { run: Run | null; last: Run | null; picks: Pick[]; evaluated: number };

const when = (s: string) => new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const signed = (p: number) => (p >= 0 ? '+' : '') + percent(p);

export function ValueView({ equityCents, onOpen, notify, onRecord }: { equityCents: number; onOpen: (fixtureId: string) => void; notify: (m: string) => void; onRecord?: RecordPlay }) {
  const [data, setData] = useState<Data | null>(null), [loading, setLoading] = useState(true), [scanning, setScanning] = useState(false), [error, setError] = useState('');
  const [league, setLeague] = useState('Tutte'), [onlyChecked, setOnlyChecked] = useState(false), [onlyIt, setOnlyIt] = useState(false);
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
  const all = data?.picks || [], checked = all.filter(p => p.is_pick).length;
  const picks = all.filter(p => (league === 'Tutte' || p.competition === league) && (!onlyChecked || p.is_pick) && (!onlyIt || (p.it_edge ?? 0) > 0));
  const hasIt = all.some(p => p.it_odds);
  const leagues = ['Tutte', ...new Set((data?.picks || []).map(p => p.competition))];
  const run = data?.run, last = data?.last;
  return <>
    <div className="page-heading"><div><p className="eyebrow">VALUE SCANNER</p><h1>Dove la quota paga di più<span>.</span></h1><p>Ogni mattina QUORUM confronta il modello con le quote dei bookmaker europei sulle tue 6 competizioni, per i prossimi 7 giorni.</p></div>
      <button className="secondary" onClick={scan} disabled={scanning}><RefreshCw size={16} className={scanning ? 'spin' : ''} />{scanning ? 'Scansione in corso…' : 'Aggiorna ora'}</button></div>
    {run && <section className="value-summary">
      <div><span>Ultima scansione</span><strong>{when(run.started_at)}</strong></div>
      <div><span>Partite nei prossimi 7 giorni</span><strong>{run.fixtures}</strong></div>
      <div><span>Con quote e modello</span><strong>{run.modelled}</strong></div>
      <div><span>Esiti valutati</span><strong>{data?.evaluated}</strong></div>
      <div><span>Con valore · superano i controlli</span><strong className="accent">{all.length} · {checked}</strong></div>
    </section>}
    {last && last.status === 'error' && <p className="value-warning"><Info size={15} />Ultimo tentativo non riuscito: {last.message}</p>}
    {run?.message && <p className="value-note"><Info size={15} />{run.message}</p>}
    <div className="filters">{leagues.map(l => <button key={l} className={league === l ? 'selected' : ''} onClick={() => setLeague(l)}>{l}</button>)}<button className={onlyChecked ? 'selected' : ''} onClick={() => setOnlyChecked(!onlyChecked)}>{onlyChecked ? '✓ ' : ''}Solo quelle che superano i controlli</button>{hasIt && <button className={onlyIt ? 'selected' : ''} onClick={() => setOnlyIt(!onlyIt)}>{onlyIt ? '✓ ' : ''}Valore su Lottomatica / Planetwin365</button>}</div>
    {loading ? <div className="empty"><span className="empty-icon"><RefreshCw className="spin" /></span><h3>Carico le giocate…</h3></div>
      : error ? <div className="empty"><span className="empty-icon"><Info /></span><h3>Scanner non disponibile</h3><p>{error}</p></div>
      : !run ? <div className="empty"><span className="empty-icon"><TrendingUp /></span><h3>Nessuna scansione ancora.</h3><p>La prima parte in automatico domattina. Puoi avviarla adesso con “Aggiorna ora”.</p></div>
      : !picks.length ? <div className="empty"><span className="empty-icon"><TrendingUp /></span><h3>Nessuna giocata con valore in questa selezione.</h3><p>Cambia competizione o disattiva “Solo quelle che superano i controlli”.</p></div>
      : <div className="value-list">{picks.map(p => {
        // When an Italian book has the market, the stake follows the Italian price (the one you can actually play).
        const itOk = !!p.it_odds && (p.it_edge ?? 0) > 0, k = p.it_odds ? (p.it_kelly ?? 0) : p.kelly;
        const raw = Math.floor(equityCents * k / 100) * 100, stake = k > 0 ? Math.max(200, raw) : 0, atMin = k > 0 && raw < 200;
        const why = p.is_pick ? [] : evaluateOutcome(p.p_model, { pMarket: p.p_market, bestOdds: p.best_odds, books: p.books }).reasons;
        return <article className={'value-card' + (p.is_pick ? ' checked' : '')} key={p.id}>
          <div className="value-head"><span>{p.competition} · {when(p.kickoff)}</span><b className="edge">{signed(p.edge)} valore</b></div>
          <h3>{p.fixture}</h3>
          <span className={'value-check ' + (p.is_pick ? 'ok' : 'warn')}>{p.is_pick ? 'Supera i controlli QUORUM' : 'Attenzione: ' + why.join(', ')}</span>
          <div className="value-pick"><strong>{p.label}</strong><span className="odds">{p.best_odds.toFixed(2)}</span><small>{p.bookmaker}</small></div>
          {p.it_odds ? <div className={'value-it ' + (itOk ? 'ok' : 'no')}><span>{p.it_book}</span><b>{p.it_odds.toFixed(2)}</b><em>{itOk ? signed(p.it_edge!) + ' valore' : 'senza valore (' + signed(p.it_edge!) + ')'}</em></div>
            : <div className="value-it none"><span>Lottomatica / Planetwin365</span><em>quota non disponibile per questo mercato</em></div>}
          <dl><div><dt>Modello</dt><dd>{percent(p.p_model)}</dd></div><div><dt>Mercato</dt><dd>{percent(p.p_market)}</dd></div><div><dt>Stima QUORUM</dt><dd>{percent(p.p_blend)}</dd></div><div><dt>{p.it_odds ? 'Puntata su ' + p.it_book : 'Puntata indicativa'}</dt><dd>{stake > 0 ? money(stake) + (atMin ? ' (minimo)' : '') : '—'}<small>{atMin ? 'calcolata ' + money(Math.round(equityCents * k)) + ', sotto la giocata minima' : percent(k) + ' del capitale'}</small></dd></div></dl>
          <div className="value-actions">{onRecord && <button className="secondary played-button" onClick={() => onRecord([{ fixtureId: p.fixture_id, fixture: p.fixture, competition: p.competition, kickoff: p.kickoff, market: p.market, label: p.label, p: p.p_blend, odds: p.it_odds || p.best_odds }], stake || 200, 'value')}><Check size={15} />L’ho giocata ({money(stake || 200)})</button>}
          <button className="text-button" onClick={() => onOpen(p.fixture_id)}>Apri la partita<ArrowRight size={15} /></button></div>
        </article>;
      })}</div>}
    <p className="footnote">Vedi tutti gli esiti con valore positivo. “Supera i controlli” significa: valore ≥ 3%, quota ≤ 4,50, almeno 5 bookmaker e modello non troppo lontano dal mercato. Stima QUORUM = 35% modello + 65% consenso del mercato senza margine. Valore = stima × quota migliore − 1 (quota migliore entro il 6% della mediana: i prezzi isolati sono esclusi). Puntata indicativa = ¼ di Kelly, massimo 2% del capitale del portafoglio selezionato. Il modello non è ancora validato dal backtest: tratta queste giocate come segnali da verificare. Le quote cambiano: controlla quella del tuo bookmaker prima di giocare.</p>
  </>;
}
