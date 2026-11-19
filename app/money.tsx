'use client';
import { useEffect, useMemo, useState } from 'react';
import { Check, Flame, Shield, ShieldCheck, TrendingUp } from 'lucide-react';
import { money, percent } from '../lib/math';
import type { Portfolio } from '../lib/types';

// Money-management profiles. Values in basis points of the bankroll.
export const PROFILES = [
  { id: 'prudente', name: 'Prudente', stake: 100, exposure: 500, day: 300, drawdown: 1500, text: '1% a giocata. Per chi vuole durare e crescere piano.', icon: ShieldCheck },
  { id: 'equilibrato', name: 'Equilibrato', stake: 200, exposure: 800, day: 500, drawdown: 2500, text: '2% a giocata. Il compromesso consigliato da QUORUM.', icon: Shield },
  { id: 'aggressivo', name: 'Aggressivo', stake: 500, exposure: 1500, day: 1000, drawdown: 4000, text: '5% a giocata. Oscillazioni forti, servono nervi saldi.', icon: TrendingUp },
] as const;
const NO_RULES = { id: 'libero', name: 'Senza regole', stake: 1500 };
// Minimum bet accepted by Italian licensed bookmakers.
export const MIN_STAKE_CENTS = 200;
export const stakeCents = (budgetCents: number, bps: number) => Math.floor(budgetCents * bps / 10000 / 100) * 100;
// Budget-based recommendation: the most prudent profile whose bet still reaches the 2 € minimum.
export function recommendProfile(budgetCents: number) {
  if (budgetCents >= 100000) return PROFILES[0];
  if (budgetCents >= 10000) return PROFILES[1];
  return PROFILES[2];
}

const SCENARIOS = [
  { id: 'edge', name: 'Con un piccolo vantaggio', p: 0.53, odds: 1.96, note: 'Vinci il 53% a quota 1,96: +3,9% di valore a giocata.' },
  { id: 'flat', name: 'Senza vantaggio', p: 0.5, odds: 1.95, note: 'Vinci il 50% a quota 1,95: il margine del bookmaker lavora contro di te.' },
];

// Monte Carlo: 300 bets, stake = fixed % of the current bankroll. Same random sequence for every profile (fair comparison).
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

export function MoneyGuide({ portfolio, equityCents, busy, onApply, onBudget }: { portfolio: Portfolio; equityCents: number; busy: boolean; onApply: (p: typeof PROFILES[number]) => void; onBudget: (cents: number) => void }) {
  const [budget, setBudget] = useState(String(Math.round(portfolio.initialCents / 100)));
  useEffect(() => setBudget(String(Math.round(portfolio.initialCents / 100))), [portfolio.id, portfolio.initialCents]);
  const rec = recommendProfile(equityCents);
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const sims = useMemo(() => [...PROFILES, NO_RULES].map(pr => ({ pr, s: simulate(pr.stake, scenario.p, scenario.odds) })), [scenario]);
  const active = PROFILES.find(p => p.stake === portfolio.stakeBps && portfolio.limitsEnabled !== false);
  const base = equityCents > 0 ? equityCents : 100000;
  return <section className="mm">
    <div className="mm-intro">
      <div><p className="eyebrow">MONEY MANAGEMENT</p><h2>Giochi come vuoi. Ma con un metodo, resti in gioco.</h2>
        <p>Il money management non decide <b>cosa</b> giochi: decide <b>quanto</b>. Anche il pronostico migliore perde spesso: con le puntate giuste una serie negativa è un incidente, senza regole è la fine del conto.</p></div>
      <ol className="mm-rules">
        <li><b>1 · Una banca dedicata</b><span>Solo soldi che puoi permetterti di perdere, separati dal resto.</span></li>
        <li><b>2 · Puntata in percentuale</b><span>Ogni giocata è una piccola % della banca di oggi: quando perdi punti meno, quando vinci punti di più.</span></li>
        <li><b>3 · Limiti e stop</b><span>Un tetto alle perdite del giorno e uno stop se la banca scende troppo. Mai rincorrere le perdite.</span></li>
      </ol>
    </div>

    <div className="mm-budget">
      <div><strong>Il tuo budget</strong><p className="small-note">Quanto vuoi dedicare alle scommesse in totale. QUORUM adatta profilo e puntate a questa cifra.</p></div>
      <form onSubmit={e => { e.preventDefault(); const v = Math.round(Number(budget.replace(',', '.')) * 100); if (Number.isFinite(v) && v >= 1000) onBudget(v); }}>
        <label><span>€</span><input inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value.replace(/[^0-9.,]/g, ''))} aria-label="Budget iniziale in euro" /></label>
        <button className="primary" disabled={busy || Math.round(Number(budget.replace(',', '.')) * 100) === portfolio.initialCents}>Salva budget</button>
      </form>
      <div className="mm-rec"><span>Capitale attuale {money(equityCents)}{equityCents !== portfolio.initialCents ? ' (budget iniziale ' + money(portfolio.initialCents) + ')' : ''}</span>
        {equityCents < 4000 ? <b>Con meno di 40 € non si rispetta la giocata minima di 2 € con nessun profilo: QUORUM consiglia almeno 50 €.</b>
          : <b>Consigliato per te: {rec.name} · {money(Math.max(MIN_STAKE_CENTS, stakeCents(equityCents, rec.stake)))} a giocata</b>}</div>
    </div>

    <div className="mm-sim">
      <div className="mm-sim-head"><strong>Cosa succede in 300 giocate</strong><div className="filters">{SCENARIOS.map(s => <button key={s.id} className={scenario.id === s.id ? 'selected' : ''} onClick={() => setScenario(s)}>{s.name}</button>)}</div></div>
      <p className="small-note">{scenario.note} Simulazione di 1.500 percorsi con la stessa sequenza di risultati per ogni profilo, partendo da {money(base)}.</p>
      <div className="mm-grid">{sims.map(({ pr, s }) => <div key={pr.id} className={'mm-card ' + (pr.id === 'libero' ? 'danger' : '')}>
        <span>{pr.id === 'libero' && <Flame size={14} />}{pr.name} · {percent(pr.stake / 10000, 0)} a giocata</span>
        <b>{money(Math.round(base * s.median))}</b><small>capitale tipico finale</small>
        <div className="mm-bars"><div><i style={{ width: Math.min(100, s.halved * 100) + '%' }} /><small>{percent(s.halved, 0)} dimezza la banca</small></div>
          <div><i className="red" style={{ width: Math.min(100, s.ruined * 100) + '%' }} /><small>{percent(s.ruined, 0)} brucia il conto</small></div></div>
      </div>)}</div>
      <p className="small-note">Il money management non trasforma un metodo perdente in vincente: rallenta le perdite e protegge i guadagni. Il vantaggio lo cerchi con Pronostici e Valore; la disciplina la metti tu.</p>
    </div>

    <div className="mm-choose"><strong>Scegli il tuo profilo per “{portfolio.name}”</strong>
      <div className="mm-grid">{PROFILES.map(pr => { const st = stakeCents(equityCents, pr.stake), low = st < MIN_STAKE_CENTS; return <button key={pr.id} disabled={busy} className={'mm-profile ' + (active?.id === pr.id ? 'active' : '') + (low ? ' low' : '')} onClick={() => onApply(pr)}>
        <span><pr.icon size={16} />{pr.name}{rec.id === pr.id && <em>consigliato</em>}{active?.id === pr.id && <Check size={15} />}</span>
        <b>{money(st)} a giocata</b>
        {low && <small className="warn">Sotto la giocata minima di 2 €: con questo budget useresti sempre 2 €, cioè {percent(MIN_STAKE_CENTS / Math.max(1, equityCents), 1)} della banca.</small>}
        <small>{pr.text}</small>
        <small>Max {money(stakeCents(equityCents, pr.day))} di perdite al giorno · stop se la banca scende sotto {money(Math.round(equityCents * (1 - pr.drawdown / 10000)))}</small>
      </button>; })}</div>
      <p className="small-note">{portfolio.limitsEnabled === false ? 'Regole disattivate: puoi registrare qualsiasi importo. QUORUM ti mostra comunque la puntata consigliata.' : active ? 'Profilo attivo: QUORUM blocca le giocate oltre i limiti. Puoi personalizzarli o disattivarli qui sotto.' : 'Limiti personalizzati attivi. Puoi tornare a un profilo con un clic.'}</p>
    </div>
  </section>;
}
