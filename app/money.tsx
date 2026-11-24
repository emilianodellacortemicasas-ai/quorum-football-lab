'use client';
import { useEffect, useMemo, useState } from 'react';
import { Check, Flame, Shield, ShieldCheck, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { money, percent } from '../lib/math';
import type { Portfolio } from '../lib/types';

// Money management: one number decides everything, the % of the current balance played on each bet.
// The other rules follow from it (values in basis points of the balance):
//  - open exposure and daily loss stop = 3 bets  (3 × stake)
//  - drawdown stop = 8 losing bets in a row      (1 − (1 − stake)^8)
export function rulesFor(stakeBps: number) {
  const s = stakeBps / 10000;
  return { stake: stakeBps, exposure: Math.min(6000, 3 * stakeBps), day: Math.min(6000, 3 * stakeBps), drawdown: Math.min(9000, Math.round((1 - Math.pow(1 - s, 8)) * 10000)) };
}
export const PROFILES = [
  { id: 'prudente', name: 'Prudente', ...rulesFor(200), text: 'Per durare: una serie nera fa poco danno.', icon: ShieldCheck },
  { id: 'equilibrato', name: 'Equilibrato', ...rulesFor(500), text: 'Il giusto mezzo tra crescita e sicurezza.', icon: Shield },
  { id: 'aggressivo', name: 'Aggressivo', ...rulesFor(1000), text: 'Crescita veloce, ma 7 perse di fila dimezzano il saldo.', icon: TrendingUp },
  { id: 'ludopatico', name: 'Ludopatico', ...rulesFor(2000), text: 'Tutto o niente: 3 perse di fila e metà del saldo è andata.', icon: Flame },
] as const;
export type Profile = { id: string; name: string; stake: number; exposure: number; day: number; drawdown: number };
// Minimum bet: 1 €. Bets are rounded down to 0,50 €.
export const MIN_STAKE_CENTS = 100;
export const stakeCents = (balanceCents: number, bps: number) => Math.max(MIN_STAKE_CENTS, Math.floor(balanceCents * bps / 10000 / 50) * 50);
// QUORUM always recommends the balanced profile.
export const recommendProfile = (_balanceCents?: number) => PROFILES[1];
// Losing bets in a row that halve the balance.
const toHalf = (bps: number) => Math.max(1, Math.ceil(Math.log(0.5) / Math.log(1 - bps / 10000)));

const SCENARIOS = [
  { id: 'edge', name: 'Con un piccolo vantaggio', p: 0.53, odds: 1.96, note: 'Vinci il 53% a quota 1,96: +3,9% di valore a giocata.' },
  { id: 'flat', name: 'Senza vantaggio', p: 0.5, odds: 1.95, note: 'Vinci il 50% a quota 1,95: il margine del bookmaker lavora contro di te.' },
];
// Monte Carlo: 300 bets, stake = fixed % of the current balance. Same random sequence for every profile (fair comparison).
function simulate(stakeBps: number, p: number, odds: number, bets = 300, paths = 1500) {
  let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const finals: number[] = []; let halved = 0, ruined = 0;
  for (let k = 0; k < paths; k++) {
    let bank = 1, low = 1;
    for (let i = 0; i < bets; i++) { const stake = bank * stakeBps / 10000; bank += rnd() < p ? stake * (odds - 1) : -stake; low = Math.min(low, bank); if (bank < 0.05) break; }
    finals.push(bank); if (low <= 0.5) halved++; if (bank < 0.05) ruined++;
  }
  finals.sort((a, b) => a - b);
  return { median: finals[Math.floor(paths / 2)], halved: halved / paths, ruined: ruined / paths };
}

export function MoneyGuide({ portfolio, equityCents, busy, onApply, onBudget }: { portfolio: Portfolio; equityCents: number; busy: boolean; onApply: (p: Profile) => void; onBudget: (cents: number) => void }) {
  const [budget, setBudget] = useState(String(Math.round(portfolio.initialCents / 100)));
  useEffect(() => setBudget(String(Math.round(portfolio.initialCents / 100))), [portfolio.id, portfolio.initialCents]);
  const bal = Math.max(0, equityCents), on = portfolio.limitsEnabled !== false;
  const active = on ? PROFILES.find(p => p.stake === portfolio.stakeBps) : undefined;
  const [custom, setCustom] = useState(String(portfolio.stakeBps / 100).replace('.', ','));
  useEffect(() => setCustom(String(portfolio.stakeBps / 100).replace('.', ',')), [portfolio.id, portfolio.stakeBps]);
  const cPct = Math.min(20, Math.max(0.5, Number(custom.replace(',', '.')) || 0)), cRules = rulesFor(Math.round(cPct * 100));
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const sims = useMemo(() => PROFILES.map(pr => ({ pr, s: simulate(pr.stake, scenario.p, scenario.odds) })), [scenario]);
  const base = bal > 0 ? bal : 5000;
  const row = (r: { stake: number; day: number; drawdown: number; exposure: number }) => {
    const st = stakeCents(bal, r.stake);
    return <dl className="mm-facts">
      <div><dt>A giocata</dt><dd>{money(st)}</dd></div>
      <div><dt>Perdita massima del giorno</dt><dd>{money(Math.floor(bal * r.day / 10000))}<small>3 giocate perse</small></dd></div>
      <div><dt>In gioco insieme al massimo</dt><dd>{money(Math.floor(bal * r.exposure / 10000))}</dd></div>
      <div><dt>Stop totale</dt><dd>sotto {money(Math.round(bal * (1 - r.drawdown / 10000)))}<small>8 perse di fila (−{percent(r.drawdown / 10000, 0)})</small></dd></div>
      <div><dt>Metà saldo bruciata dopo</dt><dd>{toHalf(r.stake)} perse di fila</dd></div>
      {st > bal * r.stake / 10000 + 1 && <p className="mm-min">Sotto la giocata minima: QUORUM usa 1 €, cioè {percent(MIN_STAKE_CENTS / Math.max(1, bal), 1)} del saldo.</p>}
    </dl>;
  };
  return <section className="mm">
    <div className="mm-budget">
      <div><strong>Totale versato</strong><p className="small-note">Tutti i soldi che hai messo finora. Per aggiungerne usa “Ricarica” in Panoramica; qui puoi correggere il totale se serve.</p></div>
      <form onSubmit={e => { e.preventDefault(); const v = Math.round(Number(budget.replace(',', '.')) * 100); if (Number.isFinite(v) && v >= 1000) onBudget(v); }}>
        <label><span>€</span><input inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value.replace(/[^0-9.,]/g, ''))} aria-label="Totale versato in euro" /></label>
        <button className="primary" disabled={busy || Math.round(Number(budget.replace(',', '.')) * 100) === portfolio.initialCents}>Correggi totale</button>
      </form>
      <div className="mm-rec"><span>Saldo disponibile {money(bal)} = {money(portfolio.initialCents)} versati {equityCents >= portfolio.initialCents ? '+' : '−'} {money(Math.abs(equityCents - portfolio.initialCents))} di risultato</span>
        <b>{active ? 'Profilo attivo: ' + active.name + ' · ' + money(stakeCents(bal, active.stake)) + ' a giocata' : on ? 'Regola personalizzata: ' + percent(portfolio.stakeBps / 10000, 1) + ' a giocata · ' + money(stakeCents(bal, portfolio.stakeBps)) : 'Regole disattivate'}</b></div>
    </div>

    <div className="mm-choose">
      <strong>Quanto rischi su ogni giocata?</strong>
      <p className="small-note">Una sola scelta: la percentuale del saldo che giochi ogni volta. La puntata si ricalcola da sola sul saldo di oggi: se perdi punti meno, se vinci punti di più. Gli stop si calcolano da soli. Giocata minima 1 €.</p>
      <div className="mm-grid mm-profiles">{PROFILES.map(pr => <button key={pr.id} disabled={busy} className={'mm-profile p-' + pr.id + (active?.id === pr.id ? ' active' : '')} onClick={() => onApply(pr)}>
        <span><pr.icon size={16} />{pr.name}{pr.id === 'equilibrato' && <em>consigliato</em>}{active?.id === pr.id && <Check size={15} />}</span>
        <b className="mm-pct">{percent(pr.stake / 10000, 0)} <small>del saldo a giocata</small></b>
        {row(pr)}
        <small className="mm-text">{pr.text}</small>
      </button>)}</div>

      <div className={'mm-custom' + (on && !active ? ' active' : '')}>
        <span className="mm-custom-head"><SlidersHorizontal size={16} />Personalizzato: scegli tu la percentuale</span>
        <div className="mm-custom-in"><label><input inputMode="decimal" value={custom} onChange={e => setCustom(e.target.value.replace(/[^0-9.,]/g, ''))} aria-label="Percentuale del saldo a giocata" /><b>%</b></label>
          <small>da 0,5% a 20%</small>
          <button className="primary" disabled={busy} onClick={() => onApply({ id: 'personalizzato', name: 'Personalizzato', ...cRules })}>Applica {percent(cPct / 100, 1)}</button></div>
        {row(cRules)}
      </div>
      <p className="small-note">{!on ? 'Regole disattivate: puoi registrare qualsiasi importo. Scegli un profilo per riattivarle.' : 'QUORUM blocca le giocate oltre la puntata, oltre la perdita massima del giorno e quando scatta lo stop totale.'}</p>
    </div>

    <details className="mm-sim">
      <summary><strong>Cosa succede in 300 giocate con ogni profilo</strong></summary>
      <div className="mm-sim-head"><div className="filters">{SCENARIOS.map(s => <button key={s.id} className={scenario.id === s.id ? 'selected' : ''} onClick={() => setScenario(s)}>{s.name}</button>)}</div></div>
      <p className="small-note">{scenario.note} Simulazione di 1.500 percorsi, partendo da {money(base)}.</p>
      <div className="mm-grid">{sims.map(({ pr, s }) => <div key={pr.id} className={'mm-card ' + (pr.id === 'ludopatico' ? 'danger' : '')}>
        <span>{pr.name} · {percent(pr.stake / 10000, 0)} a giocata</span>
        <b>{money(Math.round(base * s.median))}</b><small>saldo tipico finale</small>
        <div className="mm-bars"><div><i style={{ width: Math.min(100, s.halved * 100) + '%' }} /><small>{percent(s.halved, 0)} dimezza il saldo</small></div>
          <div><i className="red" style={{ width: Math.min(100, s.ruined * 100) + '%' }} /><small>{percent(s.ruined, 0)} brucia il conto</small></div></div>
      </div>)}</div>
      <p className="small-note">La gestione del capitale non trasforma un metodo perdente in vincente: rallenta le perdite e protegge i guadagni.</p>
    </details>
  </section>;
}
