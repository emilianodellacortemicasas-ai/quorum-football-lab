'use client';
import { useEffect, useState } from 'react';
import { Check, Copy, Trash2, Info, ListPlus, RefreshCw, Share2, Trophy, Users } from 'lucide-react';
import { money, percent } from '../lib/math';
import type { RecordPlay, RecordSystem, Selection } from '../lib/types';

type Agg = { n: number; won: number; hit: number | null; profit: number; roi: number | null; expectedHit?: number | null };
const signed = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(2).replace('.', ',');
const when = (s: string) => new Date(s).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: 'short' });
const label = (r: string | null) => r === 'won' ? 'Vinta' : r === 'lost' ? 'Persa' : r === 'void' ? 'Rimborsata' : 'In corso';

function Box({ title, a, note }: { title: string; a: Agg; note?: string }) {
  return <div className="res-box"><span>{title}</span>{a.n ? <><b>{percent(a.hit ?? 0, 0)} prese</b><small>{a.won} su {a.n} · profitto {signed(a.profit)} unità · ROI {a.roi === null ? '—' : (a.roi >= 0 ? '+' : '') + percent(a.roi)}</small>{note && <small>{note}</small>}</> : <><b>—</b><small>Nessuna giocata conclusa ancora.</small></>}</div>;
}

function MyPlays({ onGo, refreshKey, onShare, onRemove }: { onGo?: (v: string) => void; refreshKey?: number; onShare?: (id: string, portfolioId: string, shared: boolean) => Promise<boolean>; onRemove?: (id: string, portfolioId: string) => Promise<boolean> }) {
  const [m, setM] = useState<any>(null), [tick, setTick] = useState(0), [ask, setAsk] = useState('');
  useEffect(() => { fetch('/api/scanner?view=mine', { cache: 'no-store' }).then(r => r.json()).then(setM).catch(() => setM({ plays: [], summary: { total: 0 } })); }, [refreshKey, tick]);
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
        <div className="my-play-head"><span>{playTitle(x)} · {when(x.createdAt)}</span><b>{x.status === 'pending' ? 'In corso' : x.status === 'won' ? 'Vinta ' + euro(x.pnlCents) : x.status === 'lost' ? 'Persa ' + euro(x.pnlCents) : 'Rimborsata'}</b></div>
        <ul>{x.legs.map((l: any, i: number) => <li key={i}><span>{l.fixture}</span><b>{l.label}</b><i>{Number(l.odds).toFixed(2)}</i></li>)}</ul>
        <div className="my-play-foot"><span>Quota {Number(x.odds).toFixed(2)} · puntata {money(x.stakeCents)}</span><span>Probabilità QUORUM {percent(x.p, x.p < 0.1 ? 1 : 0)}</span></div>
        <div className="play-actions">{onShare && <button className={'share-chip' + (x.shared ? ' on' : '')} onClick={async () => { if (await onShare(x.id, x.portfolioId, !x.shared)) setTick(t => t + 1); }}><Share2 size={13} />{x.shared ? 'Condivisa · tocca per nasconderla' : 'Condividi con gli altri'}</button>}
          {onRemove && (ask === x.id
            ? <><button className="share-chip danger" onClick={async () => { setAsk(''); if (await onRemove(x.id, x.portfolioId)) setTick(t => t + 1); }}><Trash2 size={13} />Sì, elimina</button><button className="share-chip" onClick={() => setAsk('')}>Annulla</button></>
            : <button className="share-chip ghost" onClick={() => setAsk(x.id)}><Trash2 size={13} />Elimina</button>)}</div>
        {ask === x.id && <p className="small-note">La giocata sparisce dal portafoglio e dai risultati{x.status !== 'pending' ? ' e il capitale viene ricalcolato senza il suo esito' : ''}. Non si può annullare.</p>}
      </article>)}</div>
    </>}
  </section>;
}

const SLIP_KEY = 'quorum-slip-v1';
const sysClasses = (x: any) => x.system?.classes ?? (x.system?.k ? [{ k: x.system.k, unitCents: x.system.unitCents }] : []);
const playTitle = (x: any) => x.system ? x.name + ' · ' + x.system.combos + ' combinazioni' + (x.system.breakEven ? ' · profitto con almeno ' + x.system.breakEven + ' su ' + x.legs.length : '') : x.legs.length > 1 ? 'Multipla · ' + x.legs.length + ' eventi' : 'Singola';
function SharedPlays({ onGo, refreshKey, onRecord, onRecordSystem, onLab }: { onGo?: (v: string) => void; refreshKey?: number; onRecord?: RecordPlay; onRecordSystem?: RecordSystem; onLab?: (s: Selection[], classes: { k: number; unitCents: number }[]) => void }) {
  const [d, setD] = useState<any>(null), [who, setWho] = useState('Tutti'), [playing, setPlaying] = useState(''), [stakeText, setStakeText] = useState('2,00'), [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/scanner?view=shared', { cache: 'no-store' }).then(r => r.json()).then(setD).catch(() => setD({ plays: [], authors: [] })); }, [refreshKey]);
  if (!d) return null;
  const euro = (c: number) => (c >= 0 ? '+' : '−') + money(Math.abs(c));
  // Legs still to be played (kickoff in the future); a shared play is copyable when at least one is left.
  const future = (x: any) => x.legs.filter((l: any) => l.fixtureId && l.kickoff && Date.parse(l.kickoff) > Date.now());
  const toSlip = (legs: any[]) => legs.map((l: any) => ({ fixtureId: l.fixtureId, fixture: l.fixture, competition: l.competition, kickoff: l.kickoff, market: l.market, label: l.label, group: '', p: l.p, odds: l.odds, bookmaker: 'Lottomatica / Planetwin365', italian: true, se: Math.sqrt(l.p * (1 - l.p) / 40), value: l.p * l.odds - 1 }));
  function copy(x: any) {
    try { localStorage.setItem(SLIP_KEY, JSON.stringify(toSlip(future(x)))); } catch { }
    onGo?.('builder');
  }
  async function playToo(x: any) {
    if (!onRecord) return;
    const cents = Math.round(Number(stakeText.replace(',', '.')) * 100);
    if (!(cents >= 100)) return;
    setBusy(true);
    const left = future(x), full = x.system && left.length === x.legs.length && onRecordSystem;
    // A copied system keeps the same classes, scaled to the amount chosen by the user.
    const scaled = full ? sysClasses(x).map((c: any) => ({ k: c.k, unitCents: Math.max(5, Math.round(c.unitCents * cents / x.stakeCents)) })) : [];
    const ok = full ? await onRecordSystem!(left, scaled) : await onRecord(left, cents, 'builder', 'copiata');
    setBusy(false);
    if (ok) setPlaying('');
  }
  const list = d.plays.filter((x: any) => who === 'Tutti' || x.author === who);
  return <section className="reliability shared-plays">
    <div className="rel-head"><strong><Users size={16} /> Giocate condivise</strong><span>Le giocate che gli utenti di QUORUM hanno scelto di condividere, con il loro esito. Puoi copiarle nella tua schedina o giocarle anche tu con un tocco. Le tue le condividi da “Le tue giocate”.</span></div>
    {!d.plays.length ? <p className="small-note">Ancora nessuna giocata condivisa. Quando registri una schedina spunta “Condividi con gli altri utenti”, oppure tocca “Condividi” su una giocata qui sopra.</p> : <>
      <div className="author-row">{d.authors.map((a: any) => <button key={a.author} className={'author-card' + (who === a.author ? ' on' : '')} onClick={() => setWho(who === a.author ? 'Tutti' : a.author)}><b>{a.author}{a.mine ? ' (tu)' : ''}</b><span className={a.pnlCents >= 0 ? 'pos' : 'neg'}>{a.n ? euro(a.pnlCents) : '—'}</span><small>{a.n ? a.won + ' vinte su ' + a.n + ' · ROI ' + (a.roi === null ? '—' : (a.roi >= 0 ? '+' : '') + percent(a.roi)) : 'nessuna chiusa'}{a.open ? ' · ' + a.open + ' in corso' : ''}</small></button>)}</div>
      <div className="my-list">{list.slice(0, 40).map((x: any) => <article key={x.id} className={'my-play st-' + x.status}>
        <div className="my-play-head"><span><b className="author-tag">{x.author}{x.mine ? ' · tu' : ''}</b> · {playTitle(x)} · {when(x.createdAt)}</span><b>{x.status === 'pending' ? 'In corso' : x.status === 'won' ? 'Vinta ' + euro(x.pnlCents) : x.status === 'lost' ? 'Persa ' + euro(x.pnlCents) : 'Rimborsata'}</b></div>
        <ul>{x.legs.map((l: any, i: number) => <li key={i}><span>{l.fixture}</span><b>{l.label}</b><i>{Number(l.odds).toFixed(2)}</i></li>)}</ul>
        <div className="my-play-foot"><span>Quota {Number(x.odds).toFixed(2)} · puntata {money(x.stakeCents)}</span><span>Probabilità QUORUM {percent(x.p, x.p < 0.1 ? 1 : 0)}</span></div>
        {!x.mine && (() => {
          const left = future(x), all = left.length === x.legs.length;
          if (!left.length) return <p className="small-note copy-note">{x.status === 'pending' ? 'Partite già iniziate: non si può più copiare.' : 'Giocata chiusa.'}</p>;
          return <>
            <div className="play-actions">
              {x.system && all && onLab
                ? <button className="share-chip on" onClick={() => onLab(left.map((l: any) => ({ fixtureId: l.fixtureId, fixture: l.fixture, market: l.market, label: l.label, p: l.p, odds: l.odds, competition: l.competition, kickoff: l.kickoff })), sysClasses(x))}><Copy size={13} />Apri nel mio Laboratorio</button>
                : <button className="share-chip on" onClick={() => copy(x)}><Copy size={13} />{all ? 'Copia nella mia schedina' : 'Copia i ' + left.length + ' eventi ancora da giocare'}</button>}
              {onRecord && <button className="share-chip" onClick={() => { setStakeText(x.system && all ? (x.stakeCents / 100).toFixed(2).replace('.', ',') : '2,00'); setPlaying(playing === x.id ? '' : x.id); }}><Check size={13} />{x.system && all ? 'Lo gioco anch’io' : 'La gioco anch’io'}</button>}
            </div>
            {playing === x.id && <div className="play-too"><label>{x.system && all ? 'Tuo importo totale (€)' : 'Tua puntata (€)'}<input inputMode="decimal" value={stakeText} onChange={e => setStakeText(e.target.value)} /></label>
              <span>{x.system && all ? x.name + ' · ' + x.system.combos + ' combinazioni' : 'Quota ' + left.reduce((q: number, l: any) => q * l.odds, 1).toFixed(2) + (all ? '' : ' (solo eventi da giocare)')}</span>
              <button className="lime-button" disabled={busy} onClick={() => playToo(x)}>{busy ? 'Registro…' : 'Registra nel mio portafoglio'}</button></div>}
          </>;
        })()}
      </article>)}</div>
    </>}
  </section>;
}

export function ResultsView({ onGo, refreshKey, onShare, onRemove, onRecord, onRecordSystem, onLab }: { onGo?: (v: string) => void; refreshKey?: number; onShare?: (id: string, portfolioId: string, shared: boolean) => Promise<boolean>; onRemove?: (id: string, portfolioId: string) => Promise<boolean>; onRecord?: RecordPlay; onRecordSystem?: RecordSystem; onLab?: (s: Selection[], classes: { k: number; unitCents: number }[]) => void }) {
  const [d, setD] = useState<any>(null), [err, setErr] = useState(''), [loading, setLoading] = useState(true), [t, setT] = useState(0);
  const share = onShare ? async (id: string, pid: string, v: boolean) => { const ok = await onShare(id, pid, v); if (ok) setT(x => x + 1); return ok; } : undefined;
  useEffect(() => { fetch('/api/scanner?view=performance', { cache: 'no-store' }).then(async r => { const j: any = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch(e => setErr(e.message)).finally(() => setLoading(false)); }, []);
  return <>
    <div className="page-heading"><div><p className="eyebrow">RISULTATI</p><h1>I numeri non mentono<span>.</span></h1><p>Regolamento automatico ogni 3 ore: QUORUM segna da solo vinte e perse di value bet, schedine e giocate del tuo portafoglio.</p></div></div>
    {loading ? <div className="empty"><span className="empty-icon"><RefreshCw className="spin" /></span><h3>Calcolo il rendimento…</h3></div>
      : err ? <div className="empty"><span className="empty-icon"><Info /></span><h3>Risultati non disponibili</h3><p>{err}</p></div>
      : <>
        <MyPlays onGo={onGo} refreshKey={(refreshKey ?? 0) + t * 1000} onShare={share} onRemove={onRemove ? async (id, pid) => { const ok = await onRemove(id, pid); if (ok) setT(x => x + 1); return ok; } : undefined} />
        <SharedPlays onGo={onGo} onLab={onLab} onRecordSystem={onRecordSystem ? async (...a) => { const ok = await onRecordSystem(...a); if (ok) setT(x => x + 1); return ok; } : undefined} refreshKey={(refreshKey ?? 0) + t * 1000} onRecord={onRecord ? async (...a) => { const ok = await onRecord(...a); if (ok) setT(x => x + 1); return ok; } : undefined} />
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
