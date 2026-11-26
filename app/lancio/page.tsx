'use client';
import { useEffect, useState } from 'react';
import { GoalBox } from '../goal-box';

// Owner-only launch panel: checklist, business data, Stripe prices, sales switch.
export default function Launch() {
  const [s, setS] = useState<any>(null), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const load = () => fetch('/api/launch', { cache: 'no-store' }).then(r => r.json()).then((x: any) => x.error ? setErr(x.error) : setS(x), () => setErr('Non disponibile.'));
  useEffect(() => { load(); }, []);
  async function send(body: any, ok?: string) {
    setBusy(true); setErr(''); setMsg('');
    try { const r = await fetch('/api/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const x: any = await r.json(); if (!r.ok) throw new Error(x.error); setS(x); if (ok) setMsg(ok); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  if (err && !s) return <main className="legal-page"><p className="connection-error">{err}</p></main>;
  if (!s) return <main className="legal-page"><p>Caricamento…</p></main>;
  const groups = [...new Set(s.items.map((i: any) => i.group))] as string[];
  const b = s.business ?? {}, p = s.prices ?? {};
  const field = (k: string, label: string, v: string, ph = '') => <label key={k}>{label}<input name={k} defaultValue={v} placeholder={ph} /></label>;
  return <main className="legal-page launch-page">
    <a href="/" className="connections-brand">QUORUM<span>LANCIO</span></a>
    <h1>Pronto per la vendita?</h1>
    <div className={'launch-state' + (s.enabled ? ' on' : s.ready ? ' ready' : '')}>
      <strong>{s.enabled ? 'Vendita attiva dal ' + new Date(s.enabledAt).toLocaleDateString('it-IT') : s.ready ? 'Tutto pronto: puoi avviare la vendita' : 'Vendita spenta · mancano ' + s.missing.length + ' punti'}</strong>
      {!s.enabled ? <button className="primary" disabled={busy || !s.ready} onClick={() => send({ action: 'enable', on: true }, 'Vendita avviata.')}>Avvia la vendita</button>
        : <button className="secondary" disabled={busy} onClick={() => send({ action: 'enable', on: false }, 'Vendita sospesa: tutti tornano ad accesso completo.')}>Sospendi la vendita</button>}
    </div>
    <p className="small-note">Finché la vendita è spenta tutti gli utenti hanno accesso completo, come oggi. Accesa: chi non è abbonato passa al piano Base e spariscono dalle risposte i link alle schedine dei bookmaker.</p>
    {msg && <p className="connection-success">{msg}</p>}{err && <p className="connection-error">{err}</p>}

    {s.goal && <><h2>Obiettivo del metodo</h2><GoalBox g={s.goal} /></>}
    <h2>Lista di lancio</h2>
    {groups.map(g => <section key={g} className="launch-group"><h3>{g}</h3>{s.items.filter((i: any) => i.group === g).map((i: any) =>
      <label key={i.id} className={'launch-item' + (s.checklist[i.id] ? ' done' : '')}><input type="checkbox" checked={!!s.checklist[i.id]} disabled={busy} onChange={e => send({ action: 'check', id: i.id, done: e.target.checked })} />
        <span><b>{i.label}</b>{!i.required && <em> facoltativo</em>}<small>{i.detail}</small></span></label>)}</section>)}
    <section className="launch-group"><h3>Controlli tecnici automatici</h3>{s.tech.map((t: any) => <div key={t.id} className={'launch-item' + (t.ok ? ' done' : '')}><span className="launch-dot">{t.ok ? '✓' : '○'}</span><span><b>{t.label}</b></span></div>)}
      <p className="small-note">Le chiavi Stripe si inseriscono in <a href="/collegamenti">Collegamenti</a>: vengono cifrate nel browser e nessuno, nemmeno Claude, le vede.</p></section>

    <h2>Dati dell’impresa</h2>
    <form className="launch-form" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); send({ action: 'business', ...Object.fromEntries(f) }, 'Dati salvati: appaiono in termini, privacy e piè di pagina.'); }}>
      {field('name', 'Ragione sociale o nome dell’impresa', b.name ?? '')}{field('vat', 'Partita IVA (11 cifre)', b.vat ?? '')}{field('address', 'Sede', b.address ?? '')}
      {field('email', 'Email per clienti e privacy', b.email ?? '')}{field('pec', 'PEC', b.pec ?? '')}
      <button className="primary" disabled={busy}>Salva dati</button></form>

    <h2>Prezzi su Stripe</h2>
    <p className="small-note">Su Stripe crea 2 prodotti (Pro, Tipster) con 2 prezzi ricorrenti ciascuno: 14,90 €/mese e 119 €/anno; 39 €/mese e 349 €/anno. Incolla qui gli ID (iniziano con price_).</p>
    <form className="launch-form" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); send({ action: 'prices', ...Object.fromEntries(f) }, 'Prezzi collegati.'); }}>
      {field('pro_m', 'Pro mensile', p.pro_m ?? '', 'price_…')}{field('pro_y', 'Pro annuale', p.pro_y ?? '', 'price_…')}{field('tipster_m', 'Tipster mensile', p.tipster_m ?? '', 'price_…')}{field('tipster_y', 'Tipster annuale', p.tipster_y ?? '', 'price_…')}
      <button className="primary" disabled={busy}>Collega prezzi</button></form>
    <h2>Quote italiane in tempo reale</h2>
    <p className="small-note">Accendilo solo dopo aver attivato il piano a pagamento di OddsPapi. Con l’interruttore acceso Lottomatica/Planet si aggiornano ogni ora, gli altri ogni 6 ore, e il ricontrollo prima delle partite sale fino a 100 al giorno su tutte le proposte A/B delle 12 ore successive.</p>
    <form className="launch-form" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); send({ action: 'odds-plan', paid: f.get('paid') === 'on', limit: Number(f.get('limit')) }, 'Piano quote aggiornato.'); }}>
      <label className="launch-item"><input type="checkbox" name="paid" defaultChecked={!!s.oddsPlan?.paid} /><span><b>Piano a pagamento attivo</b></span></label>
      <label>Richieste al mese del piano<input name="limit" type="number" defaultValue={s.oddsPlan?.limit ?? 250} min={250} /></label>
      <button className="primary" disabled={busy}>Salva</button></form>
    <p><a href="/prezzi">Anteprima pagina Piani</a> · <a href="/termini">Termini</a> · <a href="/privacy">Privacy</a> · <a href="/gioco-responsabile">Gioco responsabile</a></p>
  </main>;
}
