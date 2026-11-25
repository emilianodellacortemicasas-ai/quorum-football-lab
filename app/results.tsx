'use client';
import { useEffect, useState } from 'react';
import { Check, Copy, Trash2, Info, ListPlus, RefreshCw, Share2, Trophy, Users , Pencil } from 'lucide-react';
import { money, percent } from '../lib/math';
import type { RecordPlay, RecordSystem, Selection } from '../lib/types';

type Agg = { n: number; won: number; hit: number | null; profit: number; roi: number | null; expectedHit?: number | null };
const signed = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(2).replace('.', ',');
const when = (s: string) => new Date(s).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: 'short' });
const label = (r: string | null) => r === 'won' ? 'Vinta' : r === 'lost' ? 'Persa' : r === 'void' ? 'Rimborsata' : 'In corso';

function Box({ title, a, note }: { title: string; a: Agg; note?: string }) {
  return <div className="res-box"><span>{title}</span>{a.n ? <><b>{percent(a.hit ?? 0, 0)} prese</b><small>{a.won} su {a.n} · profitto {signed(a.profit)} unità · ROI {a.roi === null ? '—' : (a.roi >= 0 ? '+' : '') + percent(a.roi)}</small>{note && <small>{note}</small>}</> : <><b>—</b><small>Nessuna giocata conclusa ancora.</small></>}</div>;
}

function ArchiveTabs({ items, tab, setTab, closed }: { items: any[]; tab: string; setTab: (t: string) => void; closed?: boolean }) {
  const won = items.filter(x => x.status === 'won').length, lost = items.filter(x => x.status === 'lost').length, voided = items.filter(x => x.status === 'void').length;
  return <div className="archive-tabs"><span>{closed ? 'Terminate' : 'Archivio'}</span>
    {[['pending', 'In corso', items.filter(x => x.status === 'pending').length], ['won', 'Vinte', won], ['lost', 'Perse', lost], ['void', 'Rimborsate', voided]].filter(([k, , n]) => closed ? k !== 'pending' : (k === 'pending' || (n as number) > 0)).map(([k, l, n]) => <button key={k as string} className={tab === k ? 'on' : ''} onClick={() => setTab(k as string)}>{l as string} <b>{n as number}</b></button>)}
  </div>;
}

// Inline editor: stake and odds of each event, to match what was really played.
function EditPlay({ x, onSave, onClose }: { x: any; onSave: (stakeCents: number, legOdds: number[]) => Promise<boolean>; onClose: () => void }) {
  const [stake, setStake] = useState((x.stakeCents / 100).toFixed(2).replace('.', ',')), [odds, setOdds] = useState<string[]>(x.legs.map((l: any) => Number(l.odds).toFixed(2).replace('.', ','))), [busy, setBusy] = useState(false);
  const num = (s: string) => Number(s.replace(',', '.'));
  const o = odds.map(num), st = num(stake), valid = st >= 0.1 && o.every(v => v >= 1.01 && v < 1000), total = o.reduce((a, b) => a * b, 1);
  return <div className="edit-play">
    {x.legs.map((l: any, i: number) => <label key={i}><span>{l.fixture}<small>{l.label}</small></span><input inputMode="decimal" value={odds[i]} onChange={e => setOdds(odds.map((v, j) => j === i ? e.target.value : v))} /></label>)}
    <label className="ep-stake"><span>{x.system ? 'Importo totale del sistema (€)' : 'Puntata (€)'}</span><input inputMode="decimal" value={stake} onChange={e => setStake(e.target.value)} /></label>
    {!x.system && valid && <p className="small-note">Quota totale {total.toFixed(2)} · vincita potenziale {money(Math.round(st * 100 * total))}</p>}
    <div className="play-actions"><button className="share-chip on" disabled={!valid || busy} onClick={async () => { setBusy(true); const ok = await onSave(Math.round(st * 100), o); setBusy(false); if (ok) onClose(); }}>Salva</button><button className="share-chip" onClick={onClose}>Annulla</button></div>
  </div>;
}

function MyPlays({ mode = 'open', onGo, refreshKey, onShare, onRemove, onEdit }: { mode?: 'open' | 'closed'; onGo?: (v: string) => void; refreshKey?: number; onShare?: (id: string, portfolioId: string, shared: boolean) => Promise<boolean>; onRemove?: (id: string, portfolioId: string) => Promise<boolean>; onEdit?: (id: string, portfolioId: string, stakeCents: number, legOdds: number[]) => Promise<boolean> }) {
  const [editing, setEditing] = useState('');
  const [m, setM] = useState<any>(null), [tick, setTick] = useState(0), [ask, setAsk] = useState(''), [tab, setTab] = useState(mode === 'open' ? 'pending' : 'won');
  useEffect(() => { fetch('/api/scanner?view=mine', { cache: 'no-store' }).then(r => r.json()).then(setM).catch(() => setM({ plays: [], summary: { total: 0 } })); }, [refreshKey, tick]);
  if (!m) return null;
  const s = m.summary, euro = (c: number) => (c >= 0 ? '+' : '−') + money(Math.abs(c));
  const box = (g: any) => <div className="res-box" key={g.key}><span>{g.label}</span>{g.n ? <><b className={g.pnlCents >= 0 ? 'pos' : 'neg'}>{euro(g.pnlCents)}</b><small>{g.won} vinte su {g.n} (QUORUM ne prevedeva {Math.round(g.expected)}) · ROI {g.roi === null ? '—' : (g.roi >= 0 ? '+' : '') + percent(g.roi)}</small></> : <><b>—</b><small>nessuna giocata chiusa</small></>}</div>;
  return <section className="reliability my-plays">
    <div className="rel-head"><strong>{mode === 'open' ? 'Le mie giocate in corso' : 'Le mie giocate terminate'}</strong><span>{mode === 'open' ? 'Le schedine che hai registrato e che devono ancora chiudersi. Qui puoi condividerle, correggere quote e puntata o eliminarle. A fine partita QUORUM le chiude da solo e le sposta in Risultati.' : 'Vinte, perse e rimborsate, con il rendimento. Quelle ancora da giocare sono in “Le mie giocate e le condivise”.'}</span></div>
    {!s.total ? <div className="empty compact"><span className="empty-icon"><ListPlus /></span><h3>Nessuna giocata registrata.</h3><p>In Costruisci schedina premi “Registra la giocata”; in Schedine e Valore “L’ho giocata”.</p>{onGo && <button className="primary" onClick={() => onGo('builder')}>Costruisci una schedina</button>}</div> : <>
      {mode === 'closed' && <><div className="my-summary">
        <div><span>Profitto</span><b className={s.pnlCents >= 0 ? 'pos' : 'neg'}>{euro(s.pnlCents)}</b><small>su {money(s.stakedCents)} giocati</small></div>
        <div><span>ROI</span><b className={(s.roi ?? 0) >= 0 ? 'pos' : 'neg'}>{s.roi === null ? '—' : (s.roi >= 0 ? '+' : '') + percent(s.roi)}</b><small>profitto ÷ giocato</small></div>
        <div><span>Vinte</span><b>{s.won} / {s.closed}</b><small>QUORUM ne prevedeva {Math.round(s.expected)}</small></div>
        <div><span>In corso</span><b>{s.open}</b><small>si regolano da sole</small></div>
      </div>
      <div className="rel-grid">{m.bySource.filter((g: any) => g.n).map(box)}{m.byKind.filter((g: any) => g.n).map(box)}</div>
      <ArchiveTabs items={m.plays} tab={tab} setTab={setTab} closed /></>}
      {mode === 'open' && !m.plays.some((x: any) => x.status === 'pending') && <p className="small-note">Nessuna giocata in corso. Quelle chiuse le trovi in Risultati.</p>}
      {mode === 'closed' && !m.plays.some((x: any) => x.status === tab) && <p className="small-note">Nessuna giocata in questo elenco.</p>}
      <div className="my-list">{m.plays.filter((x: any) => x.status === tab).slice(0, 40).map((x: any) => <article key={x.id} className={'my-play st-' + x.status}>
        <div className="my-play-head"><span>{playTitle(x)} · {when(x.createdAt)}</span><b>{x.status === 'pending' ? 'In corso' : x.status === 'won' ? 'Vinta ' + euro(x.pnlCents) : x.status === 'lost' ? 'Persa ' + euro(x.pnlCents) : 'Rimborsata'}</b></div>
        <ul>{x.legs.map((l: any, i: number) => <li key={i}><span>{l.fixture}</span><b>{l.label}</b><i>{Number(l.odds).toFixed(2)}</i></li>)}</ul>
        <div className="my-play-foot"><span>Quota {Number(x.odds).toFixed(2)} · puntata {money(x.stakeCents)}</span><span>Probabilità QUORUM {percent(x.p, x.p < 0.1 ? 1 : 0)}</span></div>
        <div className="play-actions">{onShare && <button className={'share-chip' + (x.shared ? ' on' : '')} onClick={async () => { if (await onShare(x.id, x.portfolioId, !x.shared)) setTick(t => t + 1); }}><Share2 size={13} />{x.shared ? 'Condivisa · tocca per nasconderla' : 'Condividi con gli altri'}</button>}
          {onEdit && !(x.system && x.status !== 'pending') && <button className="share-chip" onClick={() => setEditing(editing === x.id ? '' : x.id)}><Pencil size={13} />Modifica quote e puntata</button>}
          {onRemove && (ask === x.id
            ? <><button className="share-chip danger" onClick={async () => { setAsk(''); if (await onRemove(x.id, x.portfolioId)) setTick(t => t + 1); }}><Trash2 size={13} />Sì, elimina</button><button className="share-chip" onClick={() => setAsk('')}>Annulla</button></>
            : <button className="share-chip ghost" onClick={() => setAsk(x.id)}><Trash2 size={13} />Elimina</button>)}</div>
        {editing === x.id && onEdit && <EditPlay x={x} onClose={() => setEditing('')} onSave={async (s, o) => { const ok = await onEdit(x.id, x.portfolioId, s, o); if (ok) setTick(t => t + 1); return ok; }} />}
        {ask === x.id && <p className="small-note">La giocata sparisce dal portafoglio e dai risultati{x.status !== 'pending' ? ' e il capitale viene ricalcolato senza il suo esito' : ''}. Non si può annullare.</p>}
      </article>)}</div>
    </>}
  </section>;
}

const SLIP_KEY = 'quorum-slip-v1';
const sysClasses = (x: any) => x.system?.classes ?? (x.system?.k ? [{ k: x.system.k, unitCents: x.system.unitCents }] : []);
const playTitle = (x: any) => x.system ? x.name + ' · ' + x.system.combos + ' combinazioni' + (x.system.breakEven ? ' · profitto con almeno ' + x.system.breakEven + ' su ' + x.legs.length : '') : x.legs.length > 1 ? 'Multipla · ' + x.legs.length + ' eventi' : 'Singola';
function SharedPlays({ mode = 'open', onGo, refreshKey, onRecord, onRecordSystem, onLab }: { mode?: 'open' | 'closed'; onGo?: (v: string) => void; refreshKey?: number; onRecord?: RecordPlay; onRecordSystem?: RecordSystem; onLab?: (s: Selection[], classes: { k: number; unitCents: number }[]) => void }) {
  const [d, setD] = useState<any>(null), [who, setWho] = useState('Tutti'), [stab, setStab] = useState(mode === 'open' ? 'pending' : 'won'), [playing, setPlaying] = useState(''), [stakeText, setStakeText] = useState('2,00'), [busy, setBusy] = useState(false);
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
    <div className="rel-head"><strong><Users size={16} /> {mode === 'open' ? 'Le condivise in corso' : 'Le condivise terminate'}</strong><span>{mode === 'closed' ? 'L’esito delle giocate condivise da te e dagli altri utenti. ' : ''}Le giocate che gli utenti di QUORUM hanno scelto di condividere, con il loro esito. Puoi copiarle nella tua schedina o giocarle anche tu con un tocco. Le tue le condividi da “Le tue giocate”.</span></div>
    {!d.plays.length ? <p className="small-note">Ancora nessuna giocata condivisa. Quando registri una schedina spunta “Condividi con gli altri utenti”, oppure tocca “Condividi” su una giocata qui sopra.</p> : <>
      <div className="author-row">{d.authors.map((a: any) => <button key={a.author} className={'author-card' + (who === a.author ? ' on' : '')} onClick={() => setWho(who === a.author ? 'Tutti' : a.author)}><b>{a.author}{a.mine ? ' (tu)' : ''}</b><span className={a.pnlCents >= 0 ? 'pos' : 'neg'}>{a.n ? euro(a.pnlCents) : '—'}</span><small>{a.n ? a.won + ' vinte su ' + a.n + ' · ROI ' + (a.roi === null ? '—' : (a.roi >= 0 ? '+' : '') + percent(a.roi)) : 'nessuna chiusa'}{a.open ? ' · ' + a.open + ' in corso' : ''}</small></button>)}</div>
      {mode === 'closed' && <ArchiveTabs items={list} tab={stab} setTab={setStab} closed />}
      {!list.some((x: any) => x.status === stab) && <p className="small-note">{mode === 'open' ? 'Nessuna giocata condivisa in corso.' : 'Nessuna giocata in questo elenco.'}</p>}
      <div className="my-list">{list.filter((x: any) => x.status === stab).slice(0, 40).map((x: any) => <article key={x.id} className={'my-play st-' + x.status}>
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

export function ResultsView({ onGo, refreshKey, onShare, onRemove, onEdit, onRecord, onRecordSystem, onLab }: { onEdit?: (id: string, portfolioId: string, stakeCents: number, legOdds: number[]) => Promise<boolean>; onGo?: (v: string) => void; refreshKey?: number; onShare?: (id: string, portfolioId: string, shared: boolean) => Promise<boolean>; onRemove?: (id: string, portfolioId: string) => Promise<boolean>; onRecord?: RecordPlay; onRecordSystem?: RecordSystem; onLab?: (s: Selection[], classes: { k: number; unitCents: number }[]) => void }) {
  const [d, setD] = useState<any>(null), [err, setErr] = useState(''), [loading, setLoading] = useState(true), [t, setT] = useState(0);
  const share = onShare ? async (id: string, pid: string, v: boolean) => { const ok = await onShare(id, pid, v); if (ok) setT(x => x + 1); return ok; } : undefined;
  useEffect(() => { fetch('/api/scanner?view=performance', { cache: 'no-store' }).then(async r => { const j: any = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); }).catch(e => setErr(e.message)).finally(() => setLoading(false)); }, []);
  return <>
    <div className="page-heading"><div><p className="eyebrow">RISULTATI</p><h1>I numeri non mentono<span>.</span></h1><p>Solo giocate terminate: vinte, perse e rimborsate, con il rendimento. Quelle ancora da giocare sono in “Le mie giocate e le condivise”.</p></div></div>
    {loading ? <div className="empty"><span className="empty-icon"><RefreshCw className="spin" /></span><h3>Calcolo il rendimento…</h3></div>
      : err ? <div className="empty"><span className="empty-icon"><Info /></span><h3>Risultati non disponibili</h3><p>{err}</p></div>
      : <>
        <MyPlays mode="closed" onGo={onGo} refreshKey={(refreshKey ?? 0) + t * 1000} onShare={share} onRemove={onRemove ? async (id, pid) => { const ok = await onRemove(id, pid); if (ok) setT(x => x + 1); return ok; } : undefined} onEdit={onEdit ? async (id, pid, s, o) => { const ok = await onEdit(id, pid, s, o); if (ok) setT(x => x + 1); return ok; } : undefined} />
        <SharedPlays mode="closed" onGo={onGo} onLab={onLab} onRecordSystem={onRecordSystem ? async (...a) => { const ok = await onRecordSystem(...a); if (ok) setT(x => x + 1); return ok; } : undefined} refreshKey={(refreshKey ?? 0) + t * 1000} onRecord={onRecord ? async (...a) => { const ok = await onRecord(...a); if (ok) setT(x => x + 1); return ok; } : undefined} />
        <section className="reliability"><div className="rel-head"><strong>Value bet</strong><span>Puntata fissa di 1 unità alla quota migliore vista prima del calcio d'inizio.</span></div>
          <div className="rel-grid"><Box title="Tutte le value bet" a={d.value} note={d.value.expectedHit !== null && d.value.n ? 'attese ' + percent(d.value.expectedHit, 0) : undefined} />{d.valueByMarket.map((g: any) => <Box key={g.group} title={g.group} a={g} />)}</div></section>
        <section className="reliability"><div className="rel-head"><strong>Quota di chiusura</strong><span>Quota quando QUORUM ha proposto la giocata, confrontata con l’ultima quota prima del calcio d’inizio. Batterla spesso è il segnale più affidabile che il metodo funziona.</span></div>
          <div className="rel-grid"><div className="res-box"><span>Value bet con quota migliore della chiusura</span>{d.clv?.n ? <><b>{percent(d.clv.beat ?? 0, 0)}</b><small>su {d.clv.n} giocate concluse</small></> : <><b>—</b><small>Si misura dalle partite di questo fine settimana.</small></>}</div>
          <div className="res-box"><span>Vantaggio medio sulla chiusura (CLV)</span>{d.clv?.n ? <><b>{(d.clv.avg >= 0 ? '+' : '') + percent(d.clv.avg ?? 0)}</b><small>sopra zero = prendi quote migliori del mercato finale</small></> : <><b>—</b><small>In attesa dei primi dati.</small></>}</div></div></section>
        <section className="reliability"><div className="rel-head"><strong>Schedine proposte</strong><span>{d.pendingTickets} ancora in corso.</span></div>
          <div className="rel-grid">{d.tickets.length ? d.tickets.map((t: any) => <Box key={t.kind} title={t.title} a={t} />) : <p className="small-note">Le prime schedine si chiudono dopo le partite di questo fine settimana.</p>}</div></section>
        <h3 className="day-title">Ultime schedine proposte da QUORUM (terminate)</h3>
        <div className="value-list">{d.lastTickets.filter((t: any) => t.result).map((t: any) => <article key={t.id} className={'value-card result-' + (t.result || 'open')}><div className="value-head"><span>{t.title} · {when(t.created_at)}</span><b className={'edge ' + (t.result === 'won' ? '' : 'neutral')}>{label(t.result)}</b></div>
          <ul className="legs">{t.legs.map((l: any) => <li key={l.fixtureId + l.market}><div><strong>{l.fixture}</strong></div><div className="leg-pick"><b>{l.label}</b><span>{l.odds.toFixed(2)}</span></div></li>)}</ul>
          <div className="value-pick"><strong>Quota totale</strong><span className="odds">{t.odds.toFixed(2)}</span></div></article>)}</div>
        {!d.lastTickets.some((t: any) => t.result) && <div className="empty"><span className="empty-icon"><Trophy /></span><h3>Nessuna schedina registrata ancora.</h3><p>Da oggi ogni schedina proposta viene salvata e regolata in automatico.</p></div>}
      </>}
    <p className="footnote">Le giocate rimborsate (partite rinviate oltre 3 giorni o annullate, linee intere in parità) non contano. Corner, cartellini e rigori si regolano con le statistiche ufficiali Sportmonks.</p>
  </>;
}

// "Le mie giocate e le condivise": only plays still to be settled (mine and shared). Finished ones go to Risultati.
export function PlaysView({ onGo, refreshKey, onShare, onRemove, onEdit, onRecord, onRecordSystem, onLab, onLate }: { onLate?: (legs: any[], stakeCents: number) => Promise<boolean>; onEdit?: (id: string, portfolioId: string, stakeCents: number, legOdds: number[]) => Promise<boolean>; onGo?: (v: string) => void; refreshKey?: number; onShare?: (id: string, portfolioId: string, shared: boolean) => Promise<boolean>; onRemove?: (id: string, portfolioId: string) => Promise<boolean>; onRecord?: RecordPlay; onRecordSystem?: RecordSystem; onLab?: (s: Selection[], classes: { k: number; unitCents: number }[]) => void }) {
  const [t, setT] = useState(0), bump = <A extends any[]>(f?: (...a: A) => Promise<boolean>) => f ? async (...a: A) => { const ok = await f(...a); if (ok) setT(x => x + 1); return ok; } : undefined;
  return <>
    <div className="page-heading"><div><p className="eyebrow">IL TUO GIOCO</p><h1>Le mie giocate e le condivise<span>.</span></h1><p>Le giocate ancora da chiudere: le tue e quelle condivise dagli altri utenti. Appena finiscono le partite QUORUM le chiude e le trovi in Risultati.</p></div>{onGo && <button className="secondary" onClick={() => onGo('results')}>Vai ai risultati</button>}</div>
    {onLate && <LatePlay onSave={async (legs, c) => { const ok = await onLate(legs, c); if (ok) setT(x => x + 1); return ok; }} />}
    <MyPlays mode="open" onGo={onGo} refreshKey={(refreshKey ?? 0) + t * 1000} onShare={bump(onShare)} onRemove={bump(onRemove)} onEdit={bump(onEdit)} />
    <SharedPlays mode="open" onGo={onGo} onLab={onLab} refreshKey={(refreshKey ?? 0) + t * 1000} onRecord={bump(onRecord)} onRecordSystem={bump(onRecordSystem)} />
  </>;
}

// "Registra una giocata già fatta": a bet placed on the bookmaker (also on matches already started, up to 150 minutes
// after kickoff). Probabilities are taken by the server from QUORUM's last scan before each match.
const ROME = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);
const RES: [string, string][] = [['1', '1'], ['X', 'X'], ['2', '2'], ['1X', '1X'], ['X2', 'X2'], ['12', '12']];
const GOALS = ['Over 0,5', 'Over 1,5', 'Over 2,5', 'Over 3,5', 'Under 1,5', 'Under 2,5', 'Under 3,5', 'Under 4,5', 'Goal', 'No Goal', 'Multigol 1-2', 'Multigol 1-3', 'Multigol 1-4', 'Multigol 2-3', 'Multigol 2-4', 'Multigol 2-5', 'Multigol 3-5', 'Multigol 0-2'];
const HT = ['Over 0,5 1° tempo', 'Over 1,5 1° tempo', 'Under 0,5 1° tempo', 'Under 1,5 1° tempo'];
const SIMPLE: Record<string, string> = { '1': 'home', 'X': 'draw', '2': 'away', '1X': 'homeDraw', 'X2': 'drawAway', '12': 'homeAway', 'Over 0,5': 'over05', 'Over 1,5': 'over15', 'Over 2,5': 'over25', 'Over 3,5': 'over35', 'Under 1,5': 'under15', 'Under 2,5': 'under25', 'Under 3,5': 'under35', 'Under 4,5': 'under45', 'Goal': 'btts', 'No Goal': 'noGoal' };
function LatePlay({ onSave }: { onSave: (legs: any[], stakeCents: number) => Promise<boolean> }) {
  const [open, setOpen] = useState(false), [fx, setFx] = useState<any[] | null>(null), [fid, setFid] = useState(''), [r, setR] = useState(''), [g, setG] = useState(''), [h, setH] = useState(''), [odds, setOdds] = useState('');
  const [legs, setLegs] = useState<any[]>([]), [stake, setStake] = useState('2'), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  useEffect(() => { if (!open || fx) return; const now = Date.now(); Promise.all([ROME(new Date(now - 3 * 3600000)), ROME(new Date(now)), ROME(new Date(now + 86400000))].filter((d, i, a) => a.indexOf(d) === i).map(d => fetch('/api/fixtures?date=' + d, { cache: 'no-store' }).then(x => x.json()).then((x: any) => x.matches || []).catch(() => [])))
    .then(all => setFx(all.flat().filter((m: any) => Date.parse(m.kickoff) > Date.now() - 150 * 60000 && !['FT', 'AET', 'FT_PEN'].includes(m.state)).sort((a: any, b: any) => a.kickoff.localeCompare(b.kickoff)))); }, [open, fx]);
  const m = fx?.find(x => x.id === fid), parts = [r, g, h].filter(Boolean), q = Number(odds.replace(',', '.'));
  const market = parts.length === 1 && SIMPLE[parts[0]] ? SIMPLE[parts[0]] : parts.length === 1 && parts[0].startsWith('Multigol ') ? 'multigol:' + parts[0].slice(9) : 'combo:' + parts.join(' + ');
  const label = parts.length > 1 ? 'Combo: ' + parts.join(' + ') : parts[0];
  const add = () => { if (!m || !parts.length || !(q > 1)) return; setLegs([...legs.filter(l => l.fixtureId !== m.id), { fixtureId: m.id, fixture: m.home + ' – ' + m.away, competition: m.competition, kickoff: m.kickoff, market, label, p: 0.5, odds: Math.round(q * 100) / 100 }]); setFid(''); setR(''); setG(''); setH(''); setOdds(''); };
  const tot = legs.reduce((a, l) => a * l.odds, 1), cents = Math.round(Number(stake.replace(',', '.')) * 100) || 0;
  const hm = (s: string) => new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', hour: '2-digit', minute: '2-digit' });
  if (!open) return <button className="lime-button late-open" onClick={() => setOpen(true)}><ListPlus size={16} />Registra una giocata già fatta</button>;
  return <section className="reliability late-play">
    <div className="rel-head"><strong>Registra una giocata già fatta</strong><span>Per una schedina giocata sul bookmaker che non hai registrato prima: anche su partite già iniziate, fino a 2 ore e mezza dal calcio d’inizio. Scrivi le quote che hai preso; le probabilità le prende QUORUM dalla sua ultima analisi prima della partita.</span></div>
    {!fx ? <p className="small-note">Carico le partite…</p> : <>
      <div className="late-grid">
        <label className="wide"><span>Partita</span><select value={fid} onChange={e => setFid(e.target.value)}><option value="">Scegli la partita…</option>{fx.map(x => <option key={x.id} value={x.id}>{x.home} – {x.away} · {hm(x.kickoff)}{Date.parse(x.kickoff) <= Date.now() ? ' · iniziata' : ''}</option>)}</select></label>
        <label><span>Esito / doppia chance</span><select value={r} onChange={e => setR(e.target.value)}><option value="">Nessuno</option>{RES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label><span>Gol (partita intera)</span><select value={g} onChange={e => setG(e.target.value)}><option value="">Nessuno</option>{GOALS.map(x => <option key={x}>{x}</option>)}</select></label>
        <label><span>Solo 1° tempo</span><select value={h} onChange={e => setH(e.target.value)}><option value="">Nessuno</option>{HT.map(x => <option key={x}>{x}</option>)}</select></label>
        <label><span>Quota presa</span><input inputMode="decimal" value={odds} onChange={e => setOdds(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="es. 1,35" /></label>
      </div>
      {parts.length > 0 && <p className="small-note">Esito: <b>{label}</b></p>}
      <button className="secondary" disabled={!m || !parts.length || !(q > 1)} onClick={add}>Aggiungi alla giocata</button>
      {legs.length > 0 && <>
        <ul className="late-legs">{legs.map(l => <li key={l.fixtureId}><span>{l.fixture}<small>{hm(l.kickoff)}</small></span><b>{l.label}</b><i>{l.odds.toFixed(2)}</i><button onClick={() => setLegs(legs.filter(x => x !== l))} aria-label="Togli"><Trash2 size={14} /></button></li>)}</ul>
        <div className="late-foot"><span>Quota totale <b>{tot.toFixed(2)}</b></span><label>Importo giocato (€)<input inputMode="decimal" value={stake} onChange={e => setStake(e.target.value.replace(/[^0-9.,]/g, ''))} /></label><span>Vincita potenziale <b>{money(Math.round(cents * tot))}</b></span></div>
        {err && <p className="small-note warn">{err}</p>}
        <button className="lime-button" disabled={busy || cents < 100} onClick={async () => { setBusy(true); setErr(''); const ok = await onSave(legs, cents); setBusy(false); if (ok) { setLegs([]); setOpen(false); } else setErr('Registrazione non riuscita: guarda il messaggio in basso.'); }}><Check size={16} />Registra la giocata ({money(cents)})</button>
      </>}
    </>}
    <button className="text-button" onClick={() => setOpen(false)}>Chiudi</button>
  </section>;
}
