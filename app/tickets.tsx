'use client';
import { useEffect, useState } from 'react';
import { Check, Copy, FlaskConical, Info, RefreshCw, Ticket as TicketIcon } from 'lucide-react';
import { money, percent } from '../lib/math';
import type { RecordPlay, Selection } from '../lib/types';
import type { SystemTicket, Ticket } from '../lib/tickets';
import type { ExactPick } from '../lib/exact';
import { DayFilter, useDay } from './day-filter';
type ComboData = { top: { fixtureId: string; fixture: string; competition: string; kickoff: string; combo: string; p: number; others: { name: string; p: number }[] }[]; tickets: { kind: string; title: string; legs: { fixtureId: string; fixture: string; kickoff: string; combo: string; p: number }[]; p: number; fair: number }[]; slots?: { slot: string; items: { fixtureId: string; fixture: string; competition: string; kickoff: string; combo: string; p: number; others: { name: string; p: number }[] }[] }[] };
import { Count, Ring } from './motion';

const when = (s: string) => new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });

type Cal = { backtestSamples: number; liveSamples: number; backtestAt: string | null } | null;
type Hist = { weeks: number; matches: number; testDays: number; at: string; byKind: { kind: string; title: string; n: number; won: number; hit: number; expected: number; roi: number | null; avgOdds: number }[] } | null;
type Track = { kind: string; n: number; won: number; hit: number | null; expectedHit: number | null }[];
const pc = (p: number) => percent(p, p < 0.1 ? 1 : 0);
// Reliability label: how often a ticket like this is expected to win, in plain words.
const verdict = (p: number) => p >= 0.6 ? 'alta' : p >= 0.35 ? 'media' : p >= 0.12 ? 'bassa' : 'molto bassa';
const oneIn = (p: number) => p >= 0.5 ? 'vince circa ' + Math.round(p * 10) + ' volte su 10' : 'vince circa 1 volta su ' + Math.max(2, Math.round(1 / p));

const btKind = (k: string) => /^multipla-\d{4}-\d{2}-\d{2}-\d$/.test(k) ? 'multipla-giorno-' + k.slice(-1) : /^bomba-\d{4}/.test(k) ? 'bomba-giorno' : /^sistema-\d{4}/.test(k) ? 'sistema-giorno' : k;
// Backtest of a whole group of tickets (240 days, real historical prices).
function BtBadge({ history, kinds }: { history?: Hist; kinds: (k: string) => boolean }) {
  const ks = (history?.byKind || []).filter(x => kinds(x.kind));
  const n = ks.reduce((a, x) => a + x.n, 0); if (n < 5) return null;
  const won = ks.reduce((a, x) => a + x.won, 0), exp = ks.reduce((a, x) => a + x.expected * x.n, 0) / n, withRoi = ks.filter(x => x.roi !== null && x.roi !== undefined);
  const roi = withRoi.length ? withRoi.reduce((a, x) => a + (x.roi as number) * x.n, 0) / withRoi.reduce((a, x) => a + x.n, 0) : null;
  return <div className="bt-badge"><span>Backtest {history?.weeks ? history.weeks + ' settimane' : ''}</span><b>{won} vinte su {n}</b><small>({Math.round(won / n * 100)}% · previsto {Math.round(exp * 100)}%)</small>{roi !== null && <em className={roi >= 0 ? 'pos' : 'neg'}>Rendimento {roi >= 0 ? '+' : ''}{Math.round(roi * 100)}%</em>}</div>;
}

function TicketCard({ t, equityCents, onLab, cal, track, history, role = 'core', onRecord }: { t: Ticket; equityCents: number; onLab: (s: Selection[]) => void; cal?: Cal; track?: Track; history?: Hist; role?: 'core' | 'min'; onRecord?: RecordPlay }) {
  const h = history?.byKind.find(x => x.kind === btKind(t.kind));
  const kindBase = t.kind.replace(/-\d+$/, ''), real = track?.filter(x => x.kind === t.kind || x.kind.replace(/-\d+$/, '') === kindBase).reduce((a, x) => ({ n: a.n + x.n, won: a.won + x.won, exp: a.exp + (x.expectedHit ?? 0) * x.n }), { n: 0, won: 0, exp: 0 });
  const raw = Math.floor(equityCents * t.kelly / 100) * 100, stake = role === 'min' ? 100 : t.kelly > 0 ? Math.max(100, raw) : 0, started = (t as any).started;
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

type ScorerPick = { fixtureId: string; fixture: string; competition: string; kickoff: string; id: number; name: string; team: string; p: number; odds: number | null; book: string | null; italian: boolean; value: number | null };
const SLOT_INFO: Record<string, string> = { '1X': 'Casa non perde', 'X2': 'Ospite non perde', '12': 'Non finisce pari', '1': 'Vince la squadra di casa', 'X': 'Pareggio', '2': 'Vince l’ospite', 'Gol': 'Solo gol (Goal + Over, No Goal + Under)' };
function ExactSection({ list, combo, scorers, history, onOpenMatch }: { list: ExactPick[]; combo?: ComboData; scorers?: ScorerPick[]; history?: Hist; onOpenMatch?: (id: string) => void }) {
  const [open, setOpen] = useState<string | null>(null), [help, setHelp] = useState(false);
  const [tab, setTab] = useState<'multigol' | 'marcatori' | 'combo'>('combo'), [slot, setSlot] = useState('tutte');
  const detail = (id: string, only?: string) => { const e = list.find(x => x.fixtureId === id); if (!e) return null; const cs = e.combos.filter(c => !only || only === 'tutte' || c.name.split(' + ')[0] === only || (only === 'Gol' && !['1', 'X', '2', '1X', 'X2', '12'].includes(c.name.split(' + ')[0]))).slice(0, 14);
    return <div className="combo-detail" onClick={ev => ev.stopPropagation()}>
      <p className="cd-title">Le combo più probabili di questa partita{only && only !== 'tutte' ? ' · slot ' + only : ''}</p>
      <table className="cd-table"><thead><tr><th>Combo</th><th>Probabilità</th><th>Quota equa</th></tr></thead><tbody>{cs.map(c => <tr key={c.name}><td>{c.name}</td><td><b>{percent(c.p, 0)}</b></td><td>{(1 / c.p).toFixed(2)}</td></tr>)}</tbody></table>
      <p className="cd-note">Su Planetwin la trovi tra le scommesse “Combo” della partita. Se la quota che vedi lì è <b>più alta</b> della quota equa, la combo ha valore. Vuoi una combo diversa? Costruiscila tu in <b>Costruisci schedina → Costruisci la tua combo</b>.</p>
      {onOpenMatch && <button className="secondary" onClick={() => onOpenMatch(id)}>Apri la partita: tutti i mercati, forma e assenze</button>}
    </div>; };
  const hCb = history?.byKind.find(k => k.kind === 'combo-55'), hMg = history?.byKind.find(k => k.kind === 'multigol-65');
  const mg = list.map(e => ({ e, m: e.multigol.filter(x => { const [a, b] = x.range.split('-').map(Number); return b - a <= 2 && x.p >= 0.65; }).sort((x, y) => y.p - x.p)[0] })).filter(x => x.m).sort((a, b) => b.m!.p - a.m!.p).slice(0, 10);
  const slots = combo?.slots ?? [], items = slot === 'tutte' ? combo?.top ?? [] : slots.find(x => x.slot === slot)?.items ?? [];
  const sc = scorers ?? [];
  return <>
    <h3 className="day-title">⚽ Combo, Multigol e Marcatori</h3>
    <p className="small-note">Le <b>Combo</b> uniscono esito o doppia chance e gol (es. “1X + Multigol 1-3”); il <b>Multigol</b> indica quanti gol totali; i <b>Marcatori</b> sono i giocatori che QUORUM vede più vicini al gol. Quando manca la quota del bookmaker trovi la <b>quota equa</b>: gioca solo se sul tuo conto paga di più.</p>
    <div className="archive-tabs"><button className={tab === 'combo' ? 'on' : ''} onClick={() => setTab('combo')}>Combo</button><button className={tab === 'multigol' ? 'on' : ''} onClick={() => setTab('multigol')}>Multigol ≥ 65% <b>{mg.length}</b></button><button className={tab === 'marcatori' ? 'on' : ''} onClick={() => setTab('marcatori')}>Marcatori <b>{sc.length}</b></button></div>
    {tab === 'combo' && hCb && hCb.n >= 20 && <div className="bt-badge"><span>Backtest</span><b>{hCb.won} prese su {hCb.n}</b><small>({Math.round(hCb.hit * 100)}% · previsto {Math.round(hCb.expected * 100)}%)</small></div>}
    {tab === 'combo' && combo && <>
      <button className="intro-pill" onClick={() => setHelp(!help)}>ⓘ Come funzionano le combo e gli slot</button>
      {help && <div className="page-intro"><ul>
        <li><b>Combo</b> = condizioni sulla stessa partita che devono avverarsi tutte. “X2 + Over 1,5” vince se l’ospite non perde <b>e</b> si segnano almeno 2 gol.</li>
        <li><b>Slot</b> = le combo divise per la prima parte: <b>1X</b> (casa non perde), <b>X2</b> (ospite non perde), <b>12</b>, <b>1</b>, <b>X</b>, <b>2</b> e <b>Gol</b>. In ogni slot la combo più probabile di ogni partita, dalla più sicura.</li>
        <li>Ogni doppia chance si combina con Goal / No Goal, Under / Over (1,5 · 2,5 · 3,5 · 4,5) e tutti i Multigol.</li>
        <li><b>Quota equa</b> = 100 ÷ probabilità. Gioca solo se il bookmaker paga di più.</li>
      </ul></div>}
      <div className="slot-row">{[['tutte', 'Le migliori'], ...slots.map(x => [x.slot, x.slot === 'Gol' ? 'Gol' : x.slot])].map(([k, l]) => <button key={k} className={slot === k ? 'on' : ''} onClick={() => { setSlot(k); setOpen(null); }}>{l}{k !== 'tutte' && <small>{SLOT_INFO[k]}</small>}</button>)}</div>
      {slot === 'tutte' && combo.tickets.length > 0 && <div className="xs-grid">{combo.tickets.map(t => <article key={t.kind + t.legs.map(l => l.fixtureId).join()} className="xs-card combo-ticket"><small>Schedina pronta</small><strong>{t.title}</strong>
        {t.legs.map(l => <div key={l.fixtureId} className="tip-leg clickable" onClick={() => onOpenMatch?.(l.fixtureId)}><span>{l.fixture}<small>{when(l.kickoff)} · apri la partita</small></span><b>{l.combo}</b></div>)}
        <div className="xs-main"><span className="xs-pick">Quota equa {t.fair.toFixed(2)}</span><b className={t.p >= 0.4 ? 'hi' : ''}>{percent(t.p, 0)}</b></div>
        <p>Conviene solo se sul bookmaker la quota totale è più alta di {t.fair.toFixed(2)}.</p></article>)}</div>}
      <div className="xs-grid">{items.map((c, i) => <article key={c.fixtureId + c.combo} className={'xs-card clickable' + (open === c.fixtureId ? ' open' : '')} onClick={() => setOpen(open === c.fixtureId ? null : c.fixtureId)}><small><span className="slot-n">#{i + 1}</span> {c.competition} · {when(c.kickoff)}</small><strong>{c.fixture}</strong>
        <div className="xs-main"><span className="xs-pick">{c.combo}</span><b className={c.p >= 0.65 ? 'hi' : ''}>{percent(c.p, 0)}</b></div>
        <p>Quota equa {(1 / c.p).toFixed(2)}.{c.others.length ? ' Alternative: ' + c.others.map(o => o.name + ' ' + percent(o.p, 0)).join(' · ') : ''}</p>
        <span className="cd-more">{open === c.fixtureId ? 'Chiudi ▲' : 'Tocca per tutte le combo ▼'}</span>
        {open === c.fixtureId && detail(c.fixtureId, slot)}</article>)}</div>
      {!items.length && <p className="small-note">Nessuna combo in questo slot per il giorno scelto.</p>}
    </>}
    {tab === 'multigol' && hMg && hMg.n >= 20 && <div className="bt-badge"><span>Backtest</span><b>{hMg.won} presi su {hMg.n}</b><small>({Math.round(hMg.hit * 100)}% · previsto {Math.round(hMg.expected * 100)}%)</small></div>}
    {tab === 'multigol' && <div className="xs-grid">{mg.map(({ e, m }) => <article key={e.fixtureId} className="xs-card"><small>{e.competition} · {when(e.kickoff)}</small><strong>{e.fixture}</strong>
      <div className="xs-main"><span className="xs-pick">Multigol {m!.range}</span><b className={m!.p >= 0.7 ? 'hi' : ''}>{percent(m!.p, 0)}</b></div>
      <p>Quota equa {(1 / m!.p).toFixed(2)}: conviene se sul bookmaker la quota è più alta.</p></article>)}</div>}
    {tab === 'marcatori' && <>
      <p className="small-note">Probabilità che il giocatore segni almeno un gol nei 90 minuti (rigori compresi, autogol esclusi). Dove c’è la quota del bookmaker vedi anche il valore; altrimenti la quota equa. In verde le quote che pagano più del dovuto.</p>
      {!sc.length ? <p className="small-note">Nessun marcatore per il giorno scelto: i dati arrivano con la scansione delle partite.</p>
        : <div className="sc-list">{sc.map((x, i) => <article key={x.fixtureId + x.id} className={'sc-row' + (x.value !== null && x.value >= 0.03 ? ' val' : '')} onClick={() => onOpenMatch?.(x.fixtureId)}>
          <span className="sc-n">{i + 1}</span>
          <div className="sc-who"><strong>{x.name}</strong><small>{x.team} · {x.fixture} · {when(x.kickoff)}</small></div>
          <div className="sc-p"><b>{percent(x.p, 0)}</b><small>segna</small></div>
          <div className="sc-q">{x.odds ? <><b>{x.odds.toFixed(2)}</b><small>{x.book}{x.value !== null ? ' · ' + (x.value >= 0 ? '+' : '') + Math.round(x.value * 100) + '%' : ''}</small></> : <><b>{(1 / x.p).toFixed(2)}≈</b><small>quota equa</small></>}</div>
        </article>)}</div>}
    </>}
  </>;
}

function SystemCard({ x, onLab, onRecord, notify }: { x: SystemTicket; onLab?: (s: Selection[], classes: { k: number; unitCents: number }[]) => void; onRecord?: (legs: any[], classes: { k: number; unitCents: number }[]) => Promise<boolean>; notify: (m: string) => void }) {
  const [unit, setUnit] = useState('1'), u = Math.max(0.05, Number(unit.replace(',', '.')) || 1), f = u;
  const n = x.legs.length, started = x.legs.some(l => Date.parse(l.kickoff) <= Date.now());
  const classes = x.classes.map(c => ({ k: c.k, unitCents: Math.round(u * 100) }));
  const copy = () => { const t = x.name + '\n' + x.legs.map(l => '• ' + l.fixture + ' — ' + l.label + ' @ ' + l.odds.toFixed(2)).join('\n') + '\nClassi: ' + x.classes.map(c => (c.k === n ? 'Multipla' : ['', 'Singole', 'Doppie', 'Triple', 'Quadruple', 'Quintuple'][c.k]) + ' ' + money(Math.round(u * 100)) + ' a combinazione').join(', ') + '\nImporto sistema ' + money(Math.round(x.costCents * f)); navigator.clipboard?.writeText(t).then(() => notify('Sistema copiato: incollalo dove vuoi.'), () => notify('Copia non riuscita.')); };
  return <article className="value-card ticket system-card">
    <div className="value-head"><span>{x.title}</span><b className="edge">{percent(x.pProfit, 0)} profitto</b></div>
    <p className="sys-name">{x.name}</p>
    <ul className="legs">{x.legs.map(l => <li key={l.fixtureId}><div><strong>{l.fixture}</strong><small>{l.competition} · {when(l.kickoff)}</small></div><div className="leg-pick"><b>{l.label}</b><span>{l.odds.toFixed(2)}</span><small>{percent(l.p, 0)}</small></div></li>)}</ul>
    <div className="sys-summary"><div><span>Combinazioni</span><b>{x.tickets}</b></div><div><span>Importo sistema</span><b>{money(Math.round(x.costCents * f))}</b></div><div><span>Vincita min</span><b className="positive">{money(Math.round(x.minWinCents * f))}</b></div><div><span>Vincita max</span><b className="positive">{money(Math.round(x.maxReturnCents * f))}</b></div></div>
    <div className={'sys-breakeven' + (x.breakEven === null ? ' no' : '')}>{x.breakEven === null ? 'Non va mai in profitto.' : x.breakEven === n ? 'In profitto solo se vincono tutte e ' + n + '.' : <>In profitto se ne vincono <b>almeno {x.breakEven} su {n}</b>: puoi sbagliarne {n - x.breakEven}.</>}</div>
    <label className="sys-unit">Puntata per combinazione (€)<input inputMode="decimal" value={unit} onChange={e => setUnit(e.target.value)} /></label>
    <div className="play-actions"><button className="share-chip on" onClick={copy}><Copy size={13} />Copia</button>
      {onLab && <button className="share-chip" onClick={() => onLab(x.legs.map(l => ({ fixtureId: l.fixtureId, fixture: l.fixture, market: l.market, label: l.label, p: l.p, odds: l.odds, competition: l.competition, kickoff: l.kickoff })), classes)}><FlaskConical size={13} />Apri nel Laboratorio</button>}
      {onRecord && !started && <button className="share-chip" onClick={() => onRecord(x.legs, classes)}><Check size={13} />L’ho giocato ({money(Math.round(x.costCents * f))})</button>}</div>
  </article>;
}

const SECTIONS: [string, string][] = [['tutte', 'Tutte le schedine'], ['raddoppi', '🛡️ Raddoppi'], ['multiple', '📋 Multiple del giorno'], ['fasce', '🎯 3 e 5 squadre'], ['schemi', '🧩 Schemi (puoi sbagliare)'], ['sistemi', '🧮 Sistemi'], ['combo', '⚽ Combo, Multigol, Marcatori'], ['bombe', '💣 Bombe']];

export function TicketsView({ equityCents, onLab, notify, onRecord, onLabSystem, onRecordSystem, onOpenMatch }: { onOpenMatch?: (id: string) => void; equityCents: number; onLab: (s: Selection[]) => void; notify: (m: string) => void; onRecord?: RecordPlay; onLabSystem?: (s: Selection[], classes: { k: number; unitCents: number }[]) => void; onRecordSystem?: (legs: any[], classes: { k: number; unitCents: number }[]) => Promise<boolean> }) {
  const [data, setData] = useState<{ run: any; singles: Ticket[]; tickets: Ticket[]; bomb: Ticket | null; probable?: Ticket[]; sure?: Ticket[]; banded?: Ticket[]; systems?: SystemTicket[]; bombs?: Ticket[]; multiples?: Ticket[]; schemes?: SystemTicket[]; exact?: ExactPick[]; combo?: ComboData; comboBombs?: { kind: string; title: string; legs: { fixtureId: string; fixture: string; kickoff: string; label: string; p: number; odds: number }[]; p: number; fair: number }[]; days?: { day: string; n: number }[]; calibration?: Cal; track?: Track; history?: Hist } | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [scanning, setScanning] = useState(false);
  const dayF = useDay('tickets');
  const [sec, setSecS] = useState('tutte');
  useEffect(() => { try { const v = localStorage.getItem('quorum-sec'); if (v) setSecS(v); } catch {} }, []);
  const setSec = (v: string) => { setSecS(v); try { localStorage.setItem('quorum-sec', v); } catch {} };
  const show = (k: string) => sec === 'tutte' || sec === k;
  async function load() {
    setLoading(true); setError('');
    try { const r = await fetch('/api/scanner?view=tickets' + (dayF.day ? '&day=' + dayF.day : ''), { cache: 'no-store' }); const d: any = await r.json(); if (!r.ok) throw new Error(d.error); setData(d); }
    catch (e) { setError(e instanceof Error ? e.message : 'Schedine non disponibili.'); } finally { setLoading(false); }
  }
  useEffect(() => { if (dayF.ready) load(); }, [dayF.ready, dayF.day]);
  async function scan() {
    setScanning(true);
    try { const r = await fetch('/api/scanner', { method: 'POST' }); const d: any = await r.json(); if (!r.ok) throw new Error(d.error); await load(); notify('Schedine aggiornate.'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Aggiornamento non riuscito.'); } finally { setScanning(false); }
  }
  return <>
    <div className="page-heading"><div><p className="eyebrow">SCHEDINE</p><h1>Pronte da giocare<span>.</span></h1><p>Obiettivo: far crescere il capitale. Prima le schedine con lo storico migliore, poi le giocate da sogno a puntata minima.</p></div>
      <button className="secondary" onClick={scan} disabled={scanning}><RefreshCw size={16} className={scanning ? 'spin' : ''} />{scanning ? 'Aggiornamento…' : 'Aggiorna ora'}</button></div>
    <DayFilter days={(data as any)?.days} day={dayF.day} onChange={dayF.setDay} />
    <div className="section-pick"><label><span>Mostra</span><select value={sec} onChange={e => setSec(e.target.value)}>{SECTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label></div>
    {loading ? <div className="empty"><span className="empty-icon"><RefreshCw className="spin" /></span><h3>Compongo le schedine…</h3></div>
      : error ? <div className="empty"><span className="empty-icon"><Info /></span><h3>Schedine non disponibili</h3><p>{error}</p></div>
      : !data?.run ? <div className="empty"><span className="empty-icon"><TicketIcon /></span><h3>Nessun dato ancora.</h3><p>Premi “Aggiorna ora”.</p></div>
      : <>
        {(() => {
          const card = (t: Ticket, role: 'core' | 'min' = 'core') => <TicketCard key={t.kind + t.legs.map(l => l.fixtureId + l.market).join()} t={t} equityCents={equityCents} onLab={onLab} cal={data.calibration} track={data.track} history={data.history} role={role} onRecord={onRecord} />;
          const bands = ['80', '70', '60'].map(b => ({ b, label: b === '80' ? '80–90%' : b === '70' ? '70–80%' : '60–70%', list: (data.banded || []).filter(t => t.kind.endsWith('-' + b)) })).filter(x => x.list.length);
          return <>
            {show('raddoppi') && data.sure && data.sure.length > 0 && <>
              <h3 className="day-title">🛡️ Raddoppi</h3>
              <p className="small-note">Due squadre, quota circa 2: i due esiti più affidabili che insieme raddoppiano la puntata. Quote Lottomatica / Planetwin365, partite diverse tra una schedina e l’altra.</p>
              <BtBadge history={data.history} kinds={k => k.startsWith('raddoppio-sicuro')} />
              <div className="value-list">{data.sure.map(t => card(t))}</div>
            </>}
            {show('multiple') && data.multiples && data.multiples.length > 0 && <>
              <h3 className="day-title">📋 Multiple del giorno</h3>
              <p className="small-note">Per ogni giornata due multiple pronte: 3 eventi a quota 2,8–5 e 5 eventi a quota 6–12. Tra tutte le combinazioni in quella fascia, la più probabile, con un premio a quelle che pagano più del dovuto.</p>
              <BtBadge history={data.history} kinds={k => k.startsWith('multipla-giorno')} />
              <div className="value-list">{data.multiples.map(t => card(t))}</div>
            </>}
            {show('fasce') && bands.length > 0 && <>
              <h3 className="day-title">🎯 Schedine da 3 e 5 squadre</h3>
              <p className="small-note">Ogni esito ha la probabilità della fascia indicata; dentro la fascia QUORUM sceglie quelli con più valore sulle quote italiane. Più alta la fascia, più sicura la schedina e più bassa la quota.</p>
              <BtBadge history={data.history} kinds={k => k.startsWith('fascia-')} />
              {bands.map(x => <div key={x.b} className="band-block"><p className={'band-tag b' + x.b}>Esiti al {x.label}</p><div className="value-list">{x.list.map(t => card(t))}</div></div>)}
            </>}
            {show('schemi') && data.schemes && data.schemes.length > 0 && <>
              <h3 className="day-title">🧩 Schemi della settimana</h3>
              <p className="small-note">Sistemi su tutte le partite della settimana in cui <b>puoi sbagliare una partita</b> (4 su 5, 5 su 6) o <b>due</b> (5 su 7) e restare in profitto. Ogni schema usa partite diverse dagli altri. Esempio: nel 5 su 6 giochi le 6 cinquine possibili; se ne sbagli una, una cinquina è comunque vincente.</p>
              <BtBadge history={data.history} kinds={k => k.startsWith('schema-')} />
              <div className="value-list">{data.schemes.map(x => <SystemCard key={x.kind} x={x} onLab={onLabSystem} onRecord={onRecordSystem} notify={notify} />)}</div>
            </>}
            {show('sistemi') && data.systems && data.systems.length > 0 && <>
              <h3 className="day-title">🧮 Sistemi pronti</h3>
              <p className="small-note">Un sistema per ogni giorno di partite, con la struttura che dà la probabilità di profitto più alta. Copialo sul bookmaker, aprilo nel Laboratorio o registralo.</p>
              <BtBadge history={data.history} kinds={k => k === 'sistema-giorno'} />
              <div className="value-list">{data.systems.map(x => <SystemCard key={x.kind} x={x} onLab={onLabSystem} onRecord={onRecordSystem} notify={notify} />)}</div>
            </>}
            {show('combo') && data.exact && data.exact.length > 0 && <ExactSection list={data.exact} combo={data.combo} scorers={(data as any).scorers} history={data.history} onOpenMatch={onOpenMatch} />}
            {show('bombe') && data.bombs && data.bombs.length > 0 && <>
              <h3 className="day-title">💣 Bombe</h3>
              <p className="small-note">Una per ogni giornata di partite: quota da 10 a 100 in base a quante partite ci sono. Per sognare, sempre a puntata minima.</p>
              <BtBadge history={data.history} kinds={k => k === 'bomba-giorno'} />
              <div className="value-list bomb-list">{data.bombs.map(t => card(t, 'min'))}</div>
              {data.comboBombs && data.comboBombs.length > 0 && <>
                <p className="small-note"><b>Bombe combo</b>: stessa idea, ma ogni partita è una combo (esito + gol). Arrivi alla stessa quota con meno partite o con esiti più probabili. Le quote sono quelle eque: su Planetwin gioca solo se la quota totale è più alta.</p>
                <BtBadge history={data.history} kinds={k => k === 'bomba-combo'} />
                <div className="xs-grid">{data.comboBombs.map(b => <article key={b.kind} className="xs-card combo-ticket bomb-combo"><small>Bomba combo · puntata minima</small><strong>{b.title.replace('Bomba combo di ', '')}</strong>
                  {b.legs.map(l => <div key={l.fixtureId} className="tip-leg clickable" onClick={() => onOpenMatch?.(l.fixtureId)}><span>{l.fixture}<small>{when(l.kickoff)} · {percent(l.p, 0)} · equa {l.odds.toFixed(2)}</small></span><b>{l.label}</b></div>)}
                  <div className="xs-main"><span className="xs-pick">Quota equa {b.fair.toFixed(1)}</span><b>{percent(b.p, 1)}</b></div>
                  <p>Vince circa 1 volta su {Math.round(1 / b.p)}. Conviene solo se su Planetwin la quota totale supera {b.fair.toFixed(1)}.</p></article>)}</div>
              </>}
            </>}
            {!data.sure?.length && !bands.length && !data.systems?.length && !data.bombs?.length && !data.multiples?.length && !data.schemes?.length && <p className="small-note">Nessuna schedina rispetta i criteri con le partite dei prossimi giorni.</p>}
          </>;
        })()}
      </>}
    <p className="footnote">Affidabilità misurata = probabilità che la schedina vinca, corretta con il backtest (ogni settimana QUORUM riverifica il modello su circa 150 giorni di partite) e, man mano che le partite finiscono, con i risultati reali delle sue previsioni. L’intervallo indica l’incertezza della misura. Probabilità = stima QUORUM (modello + mercato). Le probabilità delle multiple si moltiplicano: più eventi aggiungi, più cala la probabilità di vincere e più margine guadagna il bookmaker. Le quote indicate sono le migliori trovate, anche su bookmaker diversi: verifica quella del tuo prima di giocare.</p>
  </>;
}
