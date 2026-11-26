'use client';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Check, ShieldCheck, ArrowRight } from 'lucide-react';
import { toOptions, type Match, type Opt } from './builder';
import { LiveButton, useLiveQuotes } from './live-quotes';
import { percent } from '../lib/math';

const SLIP_KEY = 'quorum-slip-v1';
const BASIC = /^(home|draw|away|homeDraw|drawAway|homeAway|over\d+|under\d+|btts|noGoal)$/;
const when = (s: string) => new Date(s).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// "Valore di oggi": the matches of the next 36 hours where a Lottomatica / Planet price pays more than QUORUM's
// probability says it is worth. The user picks and builds; the cover is computed in Costruisci.
export function TodayView({ notify, onBuilder, onCenter, onCover }: { notify: (m: string) => void; onBuilder: () => void; onCenter: () => void; onCover?: () => void }) {
  const [matches, setMatches] = useState<Match[] | null>(null), [err, setErr] = useState(''), [opp, setOpp] = useState<any[]>([]);
  const [slip, setSlip] = useState<Opt[]>(() => { try { return JSON.parse(localStorage.getItem(SLIP_KEY) || '[]'); } catch { return []; } });
  const live = useLiveQuotes(notify);
  const load = () => fetch('/api/scanner?view=predictions', { cache: 'no-store' }).then(r => r.json()).then((d: any) => setMatches((d.matches || []).map(toOptions).filter(Boolean)), () => setErr('Partite non disponibili.'));
  useEffect(() => { load(); fetch('/api/scanner?view=tipster-center', { cache: 'no-store' }).then(r => r.json()).then((d: any) => setOpp((d.opportunities?.list ?? []).filter((o: any) => !o.locked && o.grade !== 'C')), () => {}); }, []);
  useEffect(() => { try { localStorage.setItem(SLIP_KEY, JSON.stringify(slip)); } catch { } }, [slip]);
  const picks = useMemo(() => {
    const t = Date.now();
    return (matches ?? []).filter(m => Date.parse(m.kickoff) > t + 10 * 60000 && Date.parse(m.kickoff) < t + 36 * 3600000).map(m => {
      const best = m.opts.filter(o => BASIC.test(o.market) && o.bookmaker.startsWith('Lottomatica') && o.value >= 0.03 && o.p >= 0.4 && o.odds >= 1.3 && o.odds <= 4).sort((a, b) => b.value * b.p - a.value * a.p)[0];
      return best ? { m, o: best } : null;
    }).filter(Boolean).sort((a: any, b: any) => b.o.value * b.o.p - a.o.value * a.o.p).slice(0, 15) as { m: Match; o: Opt }[];
  }, [matches]);
  const inSlip = (o: Opt) => slip.some(s => s.fixtureId === o.fixtureId && s.market === o.market);
  const toggle = (o: Opt) => setSlip(s => inSlip(o) ? s.filter(x => !(x.fixtureId === o.fixtureId && x.market === o.market)) : [...s.filter(x => x.fixtureId !== o.fixtureId), o].sort((a, b) => a.kickoff.localeCompare(b.kickoff)));
  return <section className="today">
    <div className="page-heading"><div><p className="eyebrow">VALORE DI OGGI</p><h1>Le partite da guardare oggi<span>.</span></h1>
      <p>Qui la quota di Lottomatica / Planet paga più di quanto vale secondo QUORUM. Non sono giocate obbligate: scegli tu se farne una singola, una multipla o una combo.</p></div></div>
    <div className="section-switch"><button className="secondary" onClick={onBuilder}>Costruisci la tua schedina con le partite che vuoi tu<ArrowRight size={15} /></button>{onCover && <button className="text-button" onClick={onCover}><ShieldCheck size={15} />Copertura</button>}</div>
    <div className="today-steps">
      <div><b>1</b><span>Scegli le partite che ti convincono, anche una sola.</span></div>
      <div><b>2</b><span>Aggiorna le quote prima di giocare: il valore cambia durante il giorno.</span></div>
      <div><b>3</b><span>Nella sezione <b>Copertura</b> QUORUM calcola la giocata che ti restituisce la puntata se salta l'evento più a rischio.</span></div>
    </div>
    {opp.length > 0 && <div className="today-center"><strong>Il Centro Tipster ha {opp.length} {opp.length === 1 ? 'proposta' : 'proposte'} di livello A/B</strong><span>{opp.slice(0, 3).map(o => o.fixture + ' · ' + o.label).join(' — ')}</span><button className="secondary" onClick={onCenter}>Apri il Centro</button></div>}
    {err && <p className="connection-error">{err}</p>}
    {!matches && !err && <p>Caricamento…</p>}
    {matches && !picks.length && <div className="empty compact"><h3>Oggi nessuna quota di valore su Lottomatica / Planet.</h3><p>Succede: i giorni senza valore sono giorni in cui non si gioca. Riprova dopo la prossima analisi del mercato.</p></div>}
    <div className="today-list">{picks.map(({ m, o }) => { const on = inSlip(o); return <article key={m.fixtureId} className={'panel today-card' + (on ? ' on' : '')}>
      <div className="today-head"><div><strong>{m.fixture}</strong><small>{m.competition} · {when(m.kickoff)}</small></div><span className="today-value">+{Math.round(o.value * 100)}%</span></div>
      <div className="today-pick"><b>{o.label}</b><span>Probabilità {percent(o.p, 0)}</span><span>Quota Lottomatica / Planet <b>{o.odds.toFixed(2)}</b></span><span>Quota giusta {(1 / o.p).toFixed(2)}</span></div>
      <LiveButton fixtureId={m.fixtureId} busy={live.busy} at={m.itAt} onClick={async () => { if (await live.refresh(m.fixtureId)) load(); }} />
      <button className={on ? 'primary' : 'secondary'} onClick={() => toggle(o)}>{on ? <><Check size={15} />Nella schedina</> : <><Plus size={15} />Aggiungi alla schedina</>}</button>
    </article>; })}</div>
    {slip.length > 0 && <div className="today-bar"><span>{slip.length} {slip.length === 1 ? 'evento' : 'eventi'} in schedina</span><span className="today-bar-btns"><button className="secondary" onClick={onBuilder}>Costruisci la schedina<ArrowRight size={15} /></button>{onCover && <button className="primary" onClick={onCover}><ShieldCheck size={16} />Calcola la copertura</button>}</span></div>}
    <p className="small-note">Valore = probabilità di QUORUM × quota − 1. È un vantaggio medio su molte giocate, non una garanzia sulla singola partita. Gioca solo somme che puoi permetterti di perdere.</p>
  </section>;
}
