'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, Info, RefreshCw, Target } from 'lucide-react';
import { analyze, percent } from '../lib/math';

type Mk = { pModel: number | null; pMarket: number; pBlend: number; bestOdds: number; bookmaker: string; books: number };
type Row = { id: string; fixture_id: string; fixture: string; competition: string; kickoff: string; modelled: number; lambda_home: number | null; lambda_away: number | null; markets: Record<string, any> };
const when = (s: string) => new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const day = (s: string) => new Date(s).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' });
const fair = (p: number) => p > 0 ? (1 / p).toFixed(2) : '—';
const confidence = (p: number) => p >= 0.6 ? 'Alta' : p >= 0.48 ? 'Media' : 'Bassa';

// Statistical prediction: driven by the team-statistics model; the market is only a reference.
export function predict(r: Row) {
  if (!r.modelled || r.lambda_home === null || r.lambda_away === null) return null;
  const a = analyze(r.lambda_home, r.lambda_away), m = a.markets;
  const sign = ([['1', m.home, 'home'], ['X', m.draw, 'draw'], ['2', m.away, 'away']] as [string, number, string][]).sort((x, y) => y[1] - x[1])[0];
  const dc = ([['1X', m.homeDraw], ['X2', m.drawAway], ['12', m.homeAway]] as [string, number][]).sort((x, y) => y[1] - x[1])[0];
  const goals = m.over25 >= 0.5 ? ['Over 2,5', m.over25, 'over25'] as const : ['Under 2,5', m.under25, 'under25'] as const;
  const btts = m.btts >= 0.5 ? ['Goal', m.btts] as const : ['No Goal', m.noGoal] as const;
  const top = a.scores[0];
  // Main tip: the 1X2 sign if clear enough, otherwise the strongest between double chance and goals line.
  const main = sign[1] >= 0.5 ? { label: 'Segno ' + sign[0], p: sign[1], key: sign[2] } : dc[1] >= goals[1] ? { label: 'Doppia chance ' + dc[0], p: dc[1], key: null } : { label: goals[0], p: goals[1], key: goals[2] };
  return { sign, dc, goals, btts, top, main, xg: [r.lambda_home, r.lambda_away] as const };
}

export function PredictionsView({ onOpen, notify }: { onOpen: (fixtureId: string) => void; notify: (m: string) => void }) {
  const [data, setData] = useState<{ run: any; matches: Row[] } | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [scanning, setScanning] = useState(false), [league, setLeague] = useState('Tutte');
  async function load() {
    setLoading(true); setError('');
    try { const r = await fetch('/api/scanner?view=predictions', { cache: 'no-store' }); const d: any = await r.json(); if (!r.ok) throw new Error(d.error); setData(d); }
    catch (e) { setError(e instanceof Error ? e.message : 'Pronostici non disponibili.'); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function scan() {
    setScanning(true);
    try { const r = await fetch('/api/scanner', { method: 'POST' }); const d: any = await r.json(); if (!r.ok) throw new Error(d.error); await load(); notify('Pronostici aggiornati.'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Aggiornamento non riuscito.'); } finally { setScanning(false); }
  }
  const rows = (data?.matches || []).filter(r => league === 'Tutte' || r.competition === league);
  const leagues = ['Tutte', ...new Set((data?.matches || []).map(r => r.competition))];
  const days = [...new Set(rows.map(r => day(r.kickoff)))];
  return <>
    <div className="page-heading"><div><p className="eyebrow">PRONOSTICI</p><h1>Le partite, lette dai numeri<span>.</span></h1><p>Pronostico statistico per ogni partita dei prossimi 3 giorni: gol fatti e subiti in casa e in trasferta, ultimi 100 giorni.</p></div>
      <button className="secondary" onClick={scan} disabled={scanning}><RefreshCw size={16} className={scanning ? 'spin' : ''} />{scanning ? 'Aggiornamento…' : 'Aggiorna ora'}</button></div>
    {data?.run && <p className="value-note"><Info size={15} />Aggiornati {when(data.run.started_at)} · {data.matches.length} partite · {data.matches.filter(m => m.modelled).length} con statistiche sufficienti.</p>}
    <div className="filters">{leagues.map(l => <button key={l} className={league === l ? 'selected' : ''} onClick={() => setLeague(l)}>{l}</button>)}</div>
    {loading ? <div className="empty"><span className="empty-icon"><RefreshCw className="spin" /></span><h3>Carico i pronostici…</h3></div>
      : error ? <div className="empty"><span className="empty-icon"><Info /></span><h3>Pronostici non disponibili</h3><p>{error}</p></div>
      : !rows.length ? <div className="empty"><span className="empty-icon"><Target /></span><h3>Nessuna partita in programma.</h3><p>Premi “Aggiorna ora” per caricare il calendario.</p></div>
      : days.map(d => <section key={d}><h3 className="day-title">{d}</h3><div className="value-list">{rows.filter(r => day(r.kickoff) === d).map(r => {
        const p = predict(r), mk = (k: string | null) => k ? r.markets[k] as Mk | undefined : undefined;
        if (!p) {
          const fav = (['home', 'draw', 'away'] as const).map(k => [k, r.markets[k]?.pMarket ?? 0] as const).sort((x, y) => y[1] - x[1])[0];
          return <article className="value-card muted" key={r.id}><div className="value-head"><span>{r.competition} · {when(r.kickoff)}</span></div><h3>{r.fixture}</h3>
            <span className="value-check warn">Statistiche insufficienti (meno di 5 partite in casa/trasferta)</span>
            <p className="small-note">Solo riferimento di mercato: favorito {({ home: '1', draw: 'X', away: '2' })[fav[0]]} al {percent(fav[1])}.</p></article>;
        }
        const ref = mk(p.main.key), gap = ref && ref.pModel !== null ? ref.pModel - ref.pMarket : null;
        return <article className="value-card" key={r.id}>
          <div className="value-head"><span>{r.competition} · {when(r.kickoff)}</span><b className="edge">Fiducia {confidence(p.main.p)}</b></div>
          <h3>{r.fixture}</h3>
          <div className="value-pick"><strong>{p.main.label}</strong><span className="odds">{percent(p.main.p, 0)}</span><small>{ref ? 'quota ' + ref.bestOdds.toFixed(2) : 'quota equa ' + fair(p.main.p)}</small></div>
          <dl>
            <div><dt>Segno</dt><dd>{p.sign[0]} · {percent(p.sign[1], 0)}</dd></div>
            <div><dt>Doppia chance</dt><dd>{p.dc[0]} · {percent(p.dc[1], 0)}</dd></div>
            <div><dt>Gol</dt><dd>{p.goals[0]} · {percent(p.goals[1], 0)}</dd></div>
            <div><dt>Goal / No Goal</dt><dd>{p.btts[0]} · {percent(p.btts[1], 0)}</dd></div>
            <div><dt>Risultato più probabile</dt><dd>{p.top.home}-{p.top.away} · {percent(p.top.p, 0)}</dd></div>
            <div><dt>Gol attesi</dt><dd>{p.xg[0].toFixed(2)} – {p.xg[1].toFixed(2)}<small>campione {r.markets.meta?.sampleHome ?? '?'} / {r.markets.meta?.sampleAway ?? '?'} partite</small></dd></div>
          </dl>
          {gap !== null && <p className="small-note">Mercato: {percent(ref!.pMarket, 0)}{Math.abs(gap) > 0.1 ? ' · le statistiche si discostano molto dal mercato, verifica assenze e formazioni.' : ' · in linea con le statistiche.'}</p>}
          <button className="text-button" onClick={() => onOpen(r.fixture_id)}>Tutti i mercati della partita<ArrowRight size={15} /></button>
        </article>;
      })}</div></section>)}
    <p className="footnote">Pronostico statistico (modello Poisson su gol fatti e subiti in casa e in trasferta). Fiducia: Alta ≥ 60%, Media ≥ 48%, Bassa sotto. Non considera ancora infortuni, formazioni ed expected goals: il backtest misurerà quanto è affidabile.</p>
  </>;
}
