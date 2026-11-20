'use client';
import { useEffect, useState } from 'react';
import { Info, ListPlus, RefreshCw, Trophy } from 'lucide-react';
import { money, percent } from '../lib/math';

type Agg = { n: number; won: number; hit: number | null; profit: number; roi: number | null; expectedHit?: number | null };
const signed = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(2).replace('.', ',');
const when = (s: string) => new Date(s).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: 'short' });
const label = (r: string | null) => r === 'won' ? 'Vinta' : r === 'lost' ? 'Persa' : r === 'void' ? 'Rimborsata' : 'In corso';

function Box({ title, a, note }: { title: string; a: Agg; note?: string }) {
  return <div className="res-box"><span>{title}</span>{a.n ? <><b>{percent(a.hit ?? 0, 0)} prese</b><small>{a.won} su {a.n} · profitto {signed(a.profit)} unità · ROI {a.roi === null ? '—' : (a.roi >= 0 ? '+' : '') + percent(a.roi)}</small>{note && <small>{note}</small>}</> : <><b>—</b><small>Nessuna giocata conclusa ancora.</small></>}</div>;
}

function MyPlays({ onGo, refreshKey }: { onGo?: (v: string) => void; refreshKey?: number }) {
  const [m, setM] = useState<any>(null);
  useEffect(() => { fetch('/api/scanner?view=mine', { cache: 'no-store' }).then(r => r.json()).then(setM).catch(() => setM({ plays: [], summary: { total: 0 } })); }, [refreshKey]);
  if (!m) return null;
  const s = m.summary, euro = (c: number) => (c >= 0 ? '+' : '−') + money(Math.abs(c));
  const box = (g: any) => <div className="res-box" key={g.key}><span>{g.label}</span>{g.n ? <><b className={g.pnlCents >= 0 ? 'pos' : 'neg'}>{euro(g.pnlCents)}</b><small>{g.won} vinte su {g.n} (QUORUM ne prevedeva {Math.round(g.expected)}) · ROI {g.roi === null ? '—' : (g.roi >= 0 ? '+' : '') + percent(g.roi)}</small></> : <><b>—</b><small>nessuna giocata chiusa</small></>}</div>;
  return <section className="reliability my-plays">
    <div className="rel-head"><strong>Le tue giocate</strong><span>Le schedine che registri da Costruisci, Schedine e Valore: QUORUM le regola da solo a fine partita e aggiorna il tuo capitale.</span></div>
    {!s.total ? <div className="empty compact"><span className="empty-icon"><ListPlus /></span><h3>Nessuna giocata registrata.</h3><p>In Costruisci schedina premi “Registra la giocata”; in Schedine e Valore “L’ho giocata”.</p>{onGo && <button className="primary" onClick={() => onGo('builder')}>Costruisci una schedina</button>}</div> : <>
      <div className="my-summary">
        <div><span>Profitto</span><b className={s.pnlCents >= 0 ? 'pos' : 'neg'}>{euro(s.pnlCents)}</b><small>su {money(s.stakedCents)} giocati</small></div>
        <div><span>ROI</span><b className={(s.roi ?? 0) >= 0 ? 'pos' : 'neg'}>{s.roi === null ? '—' : (s.roi >= 0 ? '+' : '') + percent(s.roi)}</b><small>profitto ÷ giocato</small></div>
        <div><span>Vinte</span><b>{s.won} / {s.closed}</b><small>QUORUM ne prevedeva {Math.round(s.expected)}</small></div>
        <div><span>In corso</span><b>{s.open}</b><small>si regolano da sole</small></div>
      </div>
      <div className="rel-grid">{m.bySource.filter((g: any) => g.n).map(box)}{m.byKind.filter((g: any) => g.n).map(box)}</div>
      <div className="my-list">{m.plays.slice(0, 30).map((x: any) => <article key={x.id} className={'my-play st-' + x.status}>
        <div className="my-play-head"><span>{x.kind === 'multipla' ? 'Multipla · ' + x.legs.length + ' eventi' : 'Singola'} · {when(x.createdAt)}</span><b>{x.status === 'pending' ? 'In corso' : x.status === 'won' ? 'Vinta ' + euro(x.pnlCents) : x.status === 'lost' ? 'Persa ' + euro(x.pnlCents) : 'Rimborsata'}</b></div>
        <ul>{x.legs.map((l: any, i: number) => <li key={i}><span>{l.fixture}</span><b>{l.label}</b><i>{Number(l.odds).toFixed(2)}</i></li>)}</ul>
        <div className="my-play-foot"><span>Quota {Number(x.odds).toFixed(2)} · puntata {money(x.stakeCents)}</span><span>Probabilità QUORUM {percent(x.p, x.p < 0.1 ? 1 : 0)}</span></div>
      </article>)}</div>
    </>}
  </section>;
}

export function ResultsView({ onGo, refreshKey }: { onGo?: (v: string) => void; refreshKey?: number }) {
  const [d, setD] = useState<any>(null), [err, setErr] = useState(''), [loading, setLoading] = useState(true);
  useEffect(() => { fetch('/api/scanner?view=performance', { cache: 'no-store' }).then(async r => { const j: any = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch(e => setErr(e.message)).finally(() => setLoading(false)); }, []);
  return <>
    <div className="page-heading"><div><p className="eyebrow">RISULTATI</p><h1>I numeri non mentono<span>.</span></h1><p>Regolamento automatico ogni 3 ore: QUORUM segna da solo vinte e perse di value bet, schedine e giocate del tuo portafoglio.</p></div></div>
    {loading ? <div className="empty"><span className="empty-icon"><RefreshCw className="spin" /></span><h3>Calcolo il rendimento…</h3></div>
      : err ? <div className="empty"><span className="empty-icon"><Info /></span><h3>Risultati non disponibili</h3><p>{err}</p></div>
      : <>
        <MyPlays onGo={onGo} refreshKey={refreshKey} />
        <section className="reliability"><div className="rel-head"><strong>Value bet</strong><span>Puntata fissa di 1 unità alla quota migliore vista prima del calcio d'inizio.</span></div>
          <div className="rel-grid"><Box title="Tutte le value bet" a={d.value} note={d.value.expectedHit !== null && d.value.n ? 'attese ' + percent(d.value.expectedHit, 0) : undefined} />{d.valueByMarket.map((g: any) => <Box key={g.group} title={g.group} a={g} />)}</div></section>
        <section className="reliability"><div className="rel-head"><strong>Quota di chiusura</strong><span>Quota quando QUORUM ha proposto la giocata, confrontata con l’ultima quota prima del calcio d’inizio. Batterla spesso è il segnale più affidabile che il metodo funziona.</span></div>
          <div className="rel-grid"><div className="res-box"><span>Value bet con quota migliore della chiusura</span>{d.clv?.n ? <><b>{percent(d.clv.beat ?? 0, 0)}</b><small>su {d.clv.n} giocate concluse</small></> : <><b>—</b><small>Si misura dalle partite di questo fine settimana.</small></>}</div>
          <div className="res-box"><span>Vantaggio medio sulla chiusura (CLV)</span>{d.clv?.n ? <><b>{(d.clv.avg >= 0 ? '+' : '') + percent(d.clv.avg ?? 0)}</b><small>sopra zero = prendi quote migliori del mercato finale</small></> : <><b>—</b><small>In attesa dei primi dati.</small></>}</div></div></section>
        <section className="reliability"><div className="rel-head"><strong>Schedine proposte</strong><span>{d.pendingTickets} ancora in corso.</span></div>
          <div className="rel-grid">{d.tickets.length ? d.tickets.map((t: any) => <Box key={t.kind} title={t.title} a={t} />) : <p className="small-note">Le prime schedine si chiudono dopo le partite di questo fine settimana.</p>}</div></section>
        <h3 className="day-title">Ultime schedine</h3>
        <div className="value-list">{d.lastTickets.map((t: any) => <article key={t.id} className={'value-card result-' + (t.result || 'open')}><div className="value-head"><span>{t.title} · {when(t.created_at)}</span><b className={'edge ' + (t.result === 'won' ? '' : 'neutral')}>{label(t.result)}</b></div>
          <ul className="legs">{t.legs.map((l: any) => <li key={l.fixtureId + l.market}><div><strong>{l.fixture}</strong></div><div className="leg-pick"><b>{l.label}</b><span>{l.odds.toFixed(2)}</span></div></li>)}</ul>
          <div className="value-pick"><strong>Quota totale</strong><span className="odds">{t.odds.toFixed(2)}</span></div></article>)}</div>
        {!d.lastTickets.length && <div className="empty"><span className="empty-icon"><Trophy /></span><h3>Nessuna schedina registrata ancora.</h3><p>Da oggi ogni schedina proposta viene salvata e regolata in automatico.</p></div>}
      </>}
    <p className="footnote">Le giocate rimborsate (partite rinviate oltre 3 giorni o annullate, linee intere in parità) non contano. Corner, cartellini e rigori si regolano con le statistiche ufficiali Sportmonks.</p>
  </>;
}
