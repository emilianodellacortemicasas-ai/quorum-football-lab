'use client';
// Sales goal of the method: shown in /lancio and in the Centro Tipster (Prestazioni).
export function GoalBox({ g }: { g: any }) {
  const fmt = (c: any) => c.id === 'clv' ? ((c.value * 100).toFixed(1).replace('.', ',') + '% / +' + (c.target * 100) + '%') : c.id === 't' ? (c.value.toFixed(1).replace('.', ',') + ' / ' + c.target) : c.id === 'units' ? ((c.value >= 0 ? '+' : '') + c.value.toFixed(1).replace('.', ',') + ' u') : (c.value + ' / ' + c.target);
  const PH: Record<string, string> = { 'prima-fase': 'Prima fase · verifica intermedia il 31 gennaio 2027 (150 singole, CLV ≥ +1%)', 'seconda-fase': 'Seconda fase · traguardo il 31 marzo 2027', proroga: 'Proroga · ultima scadenza il 30 giugno 2027', fallito: 'Obiettivo mancato: il metodo non va in vendita così com’è', raggiunto: 'Obiettivo raggiunto: il metodo ha un vantaggio misurato' };
  return <div className={'tcx-ready' + (g.reached ? ' on' : '')}><div className="tcx-ready-h"><strong>{PH[g.phase]}</strong></div>
    <ul>{g.checks.map((c: any) => <li key={c.id} className={c.ok ? 'ok' : ''}><span>{c.ok ? '✓' : '○'}</span>{c.label}<b>{fmt(c)}</b></li>)}</ul>
    <small>{g.daysLeft > 0 ? 'Mancano ' + g.daysLeft + ' giorni al 31 marzo 2027.' : 'Scadenza del 31 marzo 2027 passata.'}{g.phase === 'seconda-fase' || g.phase === 'proroga' ? (g.checkpointOk ? ' Verifica di gennaio superata.' : ' Verifica di gennaio non superata: segmenti da rivedere.') : ''}</small></div>;
}
