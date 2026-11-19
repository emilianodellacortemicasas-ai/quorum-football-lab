'use client';
import { useMemo, useState } from 'react';
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

export function MoneyGuide({ portfolio, equityCents, busy, onApply }: { portfolio: Portfolio; equityCents: number; busy: boolean; onApply: (p: typeof PROFILES[number]) => void }) {
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
      <div className="mm-grid">{PROFILES.map(pr => <button key={pr.id} disabled={busy} className={'mm-profile ' + (active?.id === pr.id ? 'active' : '')} onClick={() => onApply(pr)}>
        <span><pr.icon size={16} />{pr.name}{active?.id === pr.id && <Check size={15} />}</span>
        <b>{money(Math.floor(equityCents * pr.stake / 10000 / 100) * 100)} a giocata</b>
        <small>{pr.text}</small>
        <small>Max {percent(pr.day / 10000, 0)} di perdite al giorno · stop a −{percent(pr.drawdown / 10000, 0)}</small>
      </button>)}</div>
      <p className="small-note">{portfolio.limitsEnabled === false ? 'Regole disattivate: puoi registrare qualsiasi importo. QUORUM ti mostra comunque la puntata consigliata.' : active ? 'Profilo attivo: QUORUM blocca le giocate oltre i limiti. Puoi personalizzarli o disattivarli qui sotto.' : 'Limiti personalizzati attivi. Puoi tornare a un profilo con un clic.'}</p>
    </div>
  </section>;
}
