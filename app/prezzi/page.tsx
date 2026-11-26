'use client';
import { useState } from 'react';
import { Footer, useBilling } from '../legal';

const eur = (c: number) => (c / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
export default function Prices() {
  const d = useBilling();
  const [year, setYear] = useState(true), [consent, setConsent] = useState(false), [busy, setBusy] = useState(''), [err, setErr] = useState('');
  const ok = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ok');
  async function go(body: any) {
    setBusy(body.price || body.action); setErr('');
    try { const r = await fetch('/api/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const x: any = await r.json(); if (!r.ok) throw new Error(x.error); window.location.href = x.url; }
    catch (e: any) { setErr(e.message); setBusy(''); }
  }
  const plans = d?.plans, me = d?.me;
  return <main className="legal-page pricing-page">
    <a href="/" className="connections-brand">QUORUM<span>FOOTBALL LAB</span></a>
    <h1>Scommetti con un metodo, <em>non con l’istinto</em>.</h1>
    <p className="pricing-lead">QUORUM è un software di analisi: probabilità, valore, gestione del capitale e un registro dei risultati che nessuno può modificare. Non vendiamo vincite sicure, perché non esistono.</p>
    {ok && <p className="connection-success">Pagamento ricevuto: l’abbonamento si attiva entro un minuto.</p>}
    {d && !d.sales && <p className="legal-draft">Gli abbonamenti non sono ancora in vendita. Oggi QUORUM è in fase di prova con un gruppo ristretto di utenti.</p>}
    <div className="pricing-toggle"><button className={!year ? 'on' : ''} onClick={() => setYear(false)}>Mensile</button><button className={year ? 'on' : ''} onClick={() => setYear(true)}>Annuale · 2 mesi gratis</button></div>
    {plans && <div className="pricing-grid">{(['base', 'pro', 'tipster'] as const).map(id => { const p = plans[id], cur = me?.plan === id && me?.sales; const price = year ? p.year : p.month;
      return <article key={id} className={'pricing-card' + (id === 'pro' ? ' best' : '')}>
        {id === 'pro' && <span className="pricing-badge">Consigliato</span>}
        <h2>{p.name}</h2><p>{p.pitch}</p>
        <strong className="pricing-price">{price ? eur(price) : 'Gratis'}<small>{price ? (year ? ' / anno' : ' / mese') : ''}</small></strong>
        {price > 0 && year && <small className="pricing-eq">pari a {eur(Math.round(p.year / 12))} al mese</small>}
        <ul>{p.lines.map((l: string) => <li key={l}>{l}</li>)}</ul>
        {id === 'base' ? <a className="secondary" href="/">{cur ? 'Il tuo piano' : 'Inizia gratis'}</a>
          : cur ? <button className="secondary" disabled={!!busy} onClick={() => go({ action: 'portal' })}>Gestisci o disdici</button>
          : <button className="primary" disabled={!d.sales || !consent || !!busy} onClick={() => go({ action: 'checkout', price: id + (year ? '_y' : '_m'), immediate: consent })}>{busy ? 'Apertura del pagamento…' : 'Abbonati a ' + p.name}</button>}
      </article>; })}</div>}
    {d?.sales && <label className="pricing-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> Chiedo di accedere subito al servizio e prendo atto che, una volta iniziato, perdo il diritto di recesso di 14 giorni (art. 59, lett. o, Codice del Consumo). Ho letto i <a href="/termini">Termini</a> e l’<a href="/privacy">Informativa privacy</a>. Dichiaro di essere maggiorenne.</label>}
    {err && <p className="connection-error">{err}</p>}
    <section className="pricing-faq">
      <h3>Domande frequenti</h3>
      <p><b>QUORUM mi fa vincere?</b> No, e diffida da chi lo promette. QUORUM stima le probabilità, ti dice quando una quota offre valore e ti aiuta a non perdere più di quanto hai deciso. Il risultato di ogni partita resta incerto.</p>
      <p><b>Posso disdire quando voglio?</b> Sì, con un clic da “Gestisci o disdici”. L’abbonamento resta attivo fino alla fine del periodo già pagato.</p>
      <p><b>Avete accordi con i bookmaker?</b> No. Nessuna affiliazione, nessun bonus, nessun link alle schedine: guadagniamo solo dagli abbonamenti.</p>
    </section>
    <Footer />
  </main>;
}
