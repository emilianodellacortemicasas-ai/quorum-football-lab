'use client';
import { LegalShell, bizLine, bizName, useBilling } from '../legal';

export default function Privacy() {
  const b = useBilling()?.business ?? null;
  return <LegalShell title="Informativa privacy e cookie" updated="26 novembre 2026">
    <h2>Titolare del trattamento</h2><p>{bizLine(b)}.</p>
    <h2>Quali dati trattiamo</h2><ul>
      <li><b>Account:</b> indirizzo email usato per accedere.</li>
      <li><b>Uso del servizio:</b> giocate registrate nel diario, impostazioni del portafoglio, preferenze.</li>
      <li><b>Pagamenti:</b> stato dell’abbonamento e identificativi forniti da Stripe. I dati della carta sono trattati solo da Stripe.</li>
      <li><b>Dati tecnici:</b> log di sicurezza necessari al funzionamento.</li></ul>
    <h2>Perché e su quale base</h2><ul>
      <li>Fornire il servizio e l’abbonamento (esecuzione del contratto).</li>
      <li>Adempiere a obblighi fiscali e contabili (obbligo di legge).</li>
      <li>Proteggere il servizio da abusi (legittimo interesse).</li></ul>
    <p>Non usiamo i dati per profilazione pubblicitaria e non li cediamo a operatori di gioco.</p>
    <h2>Fornitori</h2><p>Cloudflare (hosting e accesso), Stripe (pagamenti), fornitori di dati sportivi che non ricevono dati personali. Alcuni fornitori possono trattare dati fuori dall’Unione europea con le garanzie previste dal GDPR.</p>
    <h2>Conservazione</h2><p>Dati dell’account fino alla chiusura e per 12 mesi dopo; documenti fiscali per 10 anni come richiesto dalla legge.</p>
    <h2>I tuoi diritti</h2><p>Accesso, rettifica, cancellazione, limitazione, portabilità e opposizione scrivendo a {b?.email || '[email]'}. Puoi presentare reclamo al Garante per la protezione dei dati personali.</p>
    <h2>Cookie</h2><p>QUORUM usa solo cookie tecnici necessari all’accesso e alla sicurezza, che non richiedono consenso. Nessun cookie pubblicitario o di profilazione. Preferenze dell’app (tema, filtri) restano nella memoria del tuo browser.</p>
    <p>Responsabile: {bizName(b)}.</p>
  </LegalShell>;
}
