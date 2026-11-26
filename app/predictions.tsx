'use client';
import { FreshRow, LiveButton, useLiveQuotes } from './live-quotes';
import { useEffect, useState } from 'react';
import { ArrowRight, Info, RefreshCw, Target } from 'lucide-react';
import { analyze, negativeBinomialCdf, percent } from '../lib/math';

type Mk = { pModel: number | null; pMarket: number; pBlend: number; bestOdds: number; bookmaker: string; books: number; it?: Record<string, number> };
type Row = { id: string; fixture_id: string; fixture: string; competition: string; kickoff: string; modelled: number; lambda_home: number | null; lambda_away: number | null; markets: Record<string, any> };
const when = (s: string) => new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const day = (s: string) => new Date(s).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' });
const fair = (p: number) => p > 0 ? (1 / p).toFixed(2) : '—';
const confidence = (p: number) => p >= 0.6 ? 'Alta' : p >= 0.48 ? 'Media' : 'Bassa';

// Statistical prediction: driven by the team-statistics model; the market is only a reference.
export function predict(r: Row) {
  if (!r.modelled || r.lambda_home === null || r.lambda_away === null) return null;
  const a = analyze(r.lambda_home, r.lambda_away, r.markets.meta?.rho ?? 0), m = a.markets;
  const sign = ([['1', m.home, 'home'], ['X', m.draw, 'draw'], ['2', m.away, 'away']] as [string, number, string][]).sort((x, y) => y[1] - x[1])[0];
  const dc = ([['1X', m.homeDraw], ['X2', m.drawAway], ['12', m.homeAway]] as [string, number][]).sort((x, y) => y[1] - x[1])[0];
  const goals = m.over25 >= 0.5 ? ['Over 2,5', m.over25, 'over25'] as const : ['Under 2,5', m.under25, 'under25'] as const;
  const btts = m.btts >= 0.5 ? ['Goal', m.btts] as const : ['No Goal', m.noGoal] as const;
  const top = a.scores[0];
  // Main tip: the 1X2 sign if clear enough, otherwise the strongest between double chance and goals line.
  const main = sign[1] >= 0.5 ? { label: 'Segno ' + sign[0], p: sign[1], key: sign[2] } : dc[1] >= goals[1] ? { label: 'Doppia chance ' + dc[0], p: dc[1], key: null } : { label: goals[0], p: goals[1], key: goals[2] };
  return { sign, dc, goals, btts, top, main, xg: [r.lambda_home, r.lambda_away] as const };
}

function Extras({ meta, markets }: { meta: any; markets: Record<string, any> }) {
  if (!meta) return null;
  const c = meta.counts, pen = meta.penalties, sc = meta.scorers;
  const line = (family: 'corners' | 'cards', mean: number, shape: number) => {
    // bookmaker line closest to the expected total, otherwise the nearest .5 line
    const offered = Object.keys(markets).filter(k => k.startsWith(family + ':total:over:')).map(k => Number(k.split(':')[3]));
    const L = offered.length ? offered.reduce((a, b) => Math.abs(b - mean) < Math.abs(a - mean) ? b : a) : Math.floor(mean) + 0.5;
    const over = markets[family + ':total:over:' + L]?.pModel ?? 1 - negativeBinomialCdf(mean, shape, Math.floor(L));
    const q = markets[family + ':total:' + (over >= 0.5 ? 'over' : 'under') + ':' + L];
    return (over >= 0.5 ? 'Over ' : 'Under ') + String(L).replace('.', ',') + ' · ' + percent(over >= 0.5 ? over : 1 - over, 0) + (q ? ' · q ' + q.bestOdds.toFixed(2) : '');
  };
  const cards = c ? [c.yellow[0] + c.red[0], c.yellow[1] + c.red[1]] : null;
  const scorer = (p: any) => <span key={p.id ?? p.name} className="sc-chip"><b>{p.name}</b><i>{percent(p.p, 0)}</i>{markets['scorer:' + p.id] && <em>q {markets['scorer:' + p.id].bestOdds.toFixed(2)}</em>}</span>;
  return <div className="xtra">
    <div className="xtra-tiles">
      {c && <div className="xtra-tile"><span>Corner attesi</span><b>{(c.corners[0] + c.corners[1]).toFixed(1)}</b><small>{c.corners[0].toFixed(1)} – {c.corners[1].toFixed(1)}</small><em>{line('corners', c.corners[0] + c.corners[1], 12)}</em></div>}
      {cards && <div className="xtra-tile"><span>Cartellini attesi</span><b>{(cards[0] + cards[1]).toFixed(1)}</b><small>{cards[0].toFixed(1)} – {cards[1].toFixed(1)}</small><em>{line('cards', cards[0] + cards[1], 6)}</em></div>}
      {pen && <div className="xtra-tile"><span>Rigori</span><b>{percent(pen.awarded, 0)}</b><small>assegnato</small><em>sbagliato {percent(pen.missed, 0)}</em></div>}
    </div>
    {sc && (sc.home.length || sc.away.length) ? <div className="xtra-scorers"><span>Marcatori più probabili</span><div className="sc-cols"><div>{sc.home.slice(0, 3).map(scorer)}</div><div>{sc.away.slice(0, 3).map(scorer)}</div></div></div> : null}
  </div>;
}

function Context({ meta, fixture }: { meta: any; fixture?: string }) {
  if (!meta) return null;
  const [home, away] = (fixture || ' – ').split(' – ');
  const pos = (p: number | null | undefined, pts: number | null | undefined) => p ? <><b>{p}ª</b><small>{pts} pt</small></> : <small>—</small>;
  const dots = (f: string) => f ? <span className="form-dots">{f.split('').map((c, i) => <i key={i} className={c === 'V' ? 'w' : c === 'P' ? 'l' : 'd'}>{c}</i>)}</span> : <small>—</small>;
  const out = (o: string[] | null | undefined) => {
    if (o === null || o === undefined) return <small>n.d.</small>;
    if (!o.length) return <small className="ok-txt">nessuno</small>;
    const names = o.map(x => x.replace(/\s*\(.*\)\s*$/, ''));
    return <details className="out-list"><summary><b className="out-n">{o.length}</b><span>{names.slice(0, 2).join(', ')}{o.length > 2 ? ' +' + (o.length - 2) : ''}</span></summary><ul>{o.map(x => <li key={x}>{x}</li>)}</ul></details>;
  };
  const eff = (a: { factor: number; missing: string[]; bench: string[] }) => a.factor < 0.995
    ? <span className={'eff-chip ' + (a.factor < 0.86 ? 'hi' : 'mid')} title={[...a.missing, ...a.bench.map(b => b + ' in panchina')].join(', ')}>−{Math.round((1 - a.factor) * 100)}% gol</span>
    : <small className="ok-txt">nessuno</small>;
  const rest = (c: any) => !c || c.rest === null ? <small>n.d.</small> : <span className={'cond-chip' + (c.rest < 3.5 ? ' hi' : c.rest < 5 ? ' mid' : ' ok')}>{c.rest < 3.5 ? Math.round(c.rest * 24) + ' ore' : Math.round(c.rest) + ' giorni'}</span>;
  const busy = (c: any) => !c ? <small>n.d.</small> : <span className={'cond-chip' + (c.last14 >= 4 ? ' hi' : c.last14 >= 3 ? ' mid' : ' ok')}>{c.last14}</span>;
  const cup = (c: any) => !c ? <small>n.d.</small> : c.cups?.length ? <span className="cond-chip mid" title={c.notes?.join(' · ')}>{c.cups.slice(0, 2).join(', ')}</span> : <small className="ok-txt">nessuna</small>;
  const row = (label: string, l: any, r: any, key?: string) => <div className="vs-row" key={key ?? label}><div className="vs-l">{l}</div><span className="vs-label">{label}</span><div className="vs-r">{r}</div></div>;
  return <div className="vs">
    <div className="vs-head"><b>{home}</b><span>casa · ospite</span><b>{away}</b></div>
    {row('Classifica', pos(meta.homePos, meta.homePts), pos(meta.awayPos, meta.awayPts))}
    {row('Forma', dots(meta.homeForm), dots(meta.awayForm))}
    {row('Indisponibili', out(meta.homeOut), out(meta.awayOut))}
    {meta.adjust && row('Effetto assenze', eff(meta.adjust.home), eff(meta.adjust.away))}
    {meta.condition && (meta.condition.home || meta.condition.away) && <>
      {row('Riposo', rest(meta.condition.home), rest(meta.condition.away))}
      {row('Partite in 14 gg', busy(meta.condition.home), busy(meta.condition.away))}
      {row('Coppe vicine', cup(meta.condition.home), cup(meta.condition.away))}
    </>}
    <div className={'vs-lineup' + (meta.lineupConfirmed ? ' ok' : '')}>{meta.lineupConfirmed ? '✓ Formazioni ufficiali: calcolo aggiornato' : '⏳ Formazioni in attesa · ricalcolo ~1 ora prima'}</div>
  </div>;
}

function Reliability() {
  const [b, setB] = useState<any>(null);
  useEffect(() => { fetch('/api/backtest', { cache: 'no-store' }).then(r => r.json()).then((d: any) => d.metrics && setB(d)).catch(() => {}); }, []);
  if (!b) return null;
  const m = b.metrics, pct = (x: number) => Math.round(x * 100) + '%';
  return <section className="reliability"><div className="rel-head"><strong>Affidabilità misurata</strong><span>Backtest su {m.n} partite già giocate (ultimi {b.testDays} giorni), rifacendo ogni settimana il modello solo con i dati disponibili prima.</span></div>
    <div className="rel-grid">
      {m.buckets.filter((x: any) => x.n >= 5).map((x: any) => <div key={x.from}><span>Pronostici dati al {pct(x.from)}–{x.to > 1 ? '100%' : pct(x.to)}</span><b>{pct(x.hit)} presi</b><small>su {x.n}</small></div>)}
      <div><span>Segno 1X2 più probabile</span><b>{pct(m.acc1x2)} presi</b><small>gol previsti {m.predGoals.toFixed(2)} · reali {m.realGoals.toFixed(2)}</small></div>
      <div><span>Over/Under 2,5</span><b>{pct(m.accOU)} presi</b><small>Over previsto {pct(m.predOver)} · reale {pct(m.realOver)}</small></div>
    </div></section>;
}

export function PredictionsView({ onOpen, notify }: { onOpen: (fixtureId: string) => void; notify: (m: string) => void }) {
  const live = useLiveQuotes(notify);
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
    <div className="page-heading"><div><p className="eyebrow">PRONOSTICI</p><h1>Le partite, lette dai numeri<span>.</span></h1><p>Pronostico per ogni partita dei prossimi 7 giorni: forza di attacco e difesa pesata sugli avversari, stato di forma, fattore campo, classifica e indisponibili.</p></div>
      <button className="secondary" onClick={scan} disabled={scanning}><RefreshCw size={16} className={scanning ? 'spin' : ''} />{scanning ? 'Aggiornamento…' : 'Aggiorna ora'}</button></div>
    {data?.run && <p className="value-note"><Info size={15} />Aggiornati {when(data.run.started_at)} · {data.matches.length} partite · {data.matches.filter(m => m.modelled).length} con statistiche sufficienti.</p>}
    <Reliability />
    <div className="filters">{leagues.map(l => <button key={l} className={league === l ? 'selected' : ''} onClick={() => setLeague(l)}>{l}</button>)}</div>
    {loading ? <div className="empty"><span className="empty-icon"><RefreshCw className="spin" /></span><h3>Carico i pronostici…</h3></div>
      : error ? <div className="empty"><span className="empty-icon"><Info /></span><h3>Pronostici non disponibili</h3><p>{error}</p></div>
      : !rows.length ? <div className="empty"><span className="empty-icon"><Target /></span><h3>Nessuna partita in programma.</h3><p>Premi “Aggiorna ora” per caricare il calendario.</p></div>
      : days.map(d => <section key={d}><h3 className="day-title">{d}</h3><div className="value-list">{rows.filter(r => day(r.kickoff) === d).map(r => {
        const p = predict(r), mk = (k: string | null) => k ? r.markets[k] as Mk | undefined : undefined;
        if (!p) {
          const fav = (['home', 'draw', 'away'] as const).map(k => [k, r.markets[k]?.pMarket ?? 0] as const).sort((x, y) => y[1] - x[1])[0];
          return <article className="value-card muted" key={r.id}><div className="value-head"><span>{r.competition} · {when(r.kickoff)}</span></div><h3>{r.fixture}</h3>
            <span className="value-check warn">Dati insufficienti per stimare una delle due squadre</span><Context meta={r.markets.meta} fixture={r.fixture} />
            <p className="small-note">Solo riferimento di mercato: favorito {({ home: '1', draw: 'X', away: '2' })[fav[0]]} al {percent(fav[1])}.</p></article>;
        }
        const ref = mk(p.main.key), gap = ref && ref.pModel !== null ? ref.pModel - ref.pMarket : null;
        return <article className="value-card" key={r.id}>
          <div className="value-head"><span>{r.competition} · {when(r.kickoff)}</span><b className="edge">Fiducia {confidence(p.main.p)}</b></div>
          <h3>{r.fixture}</h3>
          <div className="value-pick"><strong>{p.main.label}</strong><span className="odds">{percent(p.main.p, 0)}</span><small>{ref ? 'quota ' + ref.bestOdds.toFixed(2) : 'quota equa ' + fair(p.main.p)}</small></div>
          {live.fresh[r.fixture_id] ? <FreshRow q={live.fresh[r.fixture_id].quotes[p.main.key!]} p={p.main.p} /> : ref?.it && <FreshRow q={ref.it} p={p.main.p} now={false} />}
          {r.markets?.home?.it && <LiveButton fixtureId={r.fixture_id} busy={live.busy} at={live.fresh[r.fixture_id]?.at ?? r.markets?.itAt?.Lottomatica ?? (r.markets?.itAt ? Object.values(r.markets.itAt as Record<string, string>).sort().at(-1) : null)} onClick={() => live.refresh(r.fixture_id)} />}
          <dl>
            <div><dt>Segno</dt><dd>{p.sign[0]} · {percent(p.sign[1], 0)}</dd></div>
            <div><dt>Doppia chance</dt><dd>{p.dc[0]} · {percent(p.dc[1], 0)}</dd></div>
            <div><dt>Gol</dt><dd>{p.goals[0]} · {percent(p.goals[1], 0)}</dd></div>
            <div><dt>Goal / No Goal</dt><dd>{p.btts[0]} · {percent(p.btts[1], 0)}</dd></div>
            <div><dt>Risultato più probabile</dt><dd>{p.top.home}-{p.top.away} · {percent(p.top.p, 0)}</dd></div>
            <div><dt>Gol attesi</dt><dd>{p.xg[0].toFixed(2)} – {p.xg[1].toFixed(2)}<small>su {r.markets.meta?.sampleHome ?? '?'} / {r.markets.meta?.sampleAway ?? '?'} partite</small></dd></div>
          </dl>
          <Extras meta={r.markets.meta} markets={r.markets} />
          <Context meta={r.markets.meta} fixture={r.fixture} />
          {gap !== null && <p className="small-note">Mercato: {percent(ref!.pMarket, 0)}{Math.abs(gap) > 0.1 ? ' · le statistiche si discostano molto dal mercato, verifica assenze e formazioni.' : ' · in linea con le statistiche.'}</p>}
          <button className="text-button" onClick={() => onOpen(r.fixture_id)}>Tutti i mercati della partita<ArrowRight size={15} /></button>
        </article>;
      })}</div></section>)}
    <p className="footnote">Modello v2.1: rating di attacco e difesa su ~13 mesi di partite del campionato (più peso alle recenti), fattore campo, correzione Dixon–Coles e calibrazione dei gol da backtest. Assenze nel calcolo: i gol attesi di una squadra scendono in base alla quota di gol dei marcatori assenti (fino a −25%); con le formazioni ufficiali, circa un’ora prima, pesano anche i marcatori in panchina. Corner e cartellini: medie di squadra pesate sugli avversari. Rigori: frequenza di rigori a favore e contro di ogni squadra; sbagliato = assegnato × percentuale di errore del campionato. Marcatori: quota dei gol della squadra segnati dal giocatore nell'ultimo anno. Fiducia: Alta ≥ 60%, Media ≥ 48%, Bassa sotto.</p>
  </>;
}
