'use client';
import { LegalShell, bizLine, bizName, useBilling } from '../legal';

export default function Terms() {
  const b = useBilling()?.business ?? null;
  return <LegalShell title="Termini e condizioni di servizio" updated="26 novembre 2026">
    <h2>1. Chi siamo</h2><p>Il servizio QUORUM · Football Lab è fornito da {bizLine(b)} (“{bizName(b)}”).</p>
    <h2>2. Cos’è QUORUM</h2><p>QUORUM è un software di analisi statistica del calcio. Elabora dati sportivi e quote pubbliche per stimare probabilità e valore, e offre strumenti di gestione del capitale e un diario personale. QUORUM non raccoglie scommesse, non è un concessionario di gioco, non intermedia giocate e non ha accordi commerciali, di affiliazione o promozionali con operatori di gioco. Le quote mostrate hanno finalità esclusivamente informativa e di confronto.</p>
    <h2>3. Nessuna garanzia di risultato</h2><p>Le analisi sono stime probabilistiche e possono essere sbagliate. I risultati passati, anche se misurati e certificati, non garantiscono risultati futuri. QUORUM non fornisce consulenza finanziaria o di investimento. Ogni decisione di gioco è presa dall’utente, sotto la sua esclusiva responsabilità e nel rispetto della legge.</p>
    <h2>4. Requisiti</h2><p>Il servizio è riservato ai maggiorenni. L’utente si impegna a giocare solo con operatori autorizzati dall’Agenzia delle Dogane e dei Monopoli e a non superare le somme che può permettersi di perdere.</p>
    <h2>5. Piani e prezzi</h2><p>Il piano Base è gratuito. I piani Pro e Tipster sono abbonamenti mensili o annuali ai prezzi indicati nella pagina <a href="/prezzi">Piani</a>, IVA inclusa ove dovuta. Il pagamento è gestito da Stripe; {bizName(b)} non conserva i dati della carta.</p>
    <h2>6. Rinnovo e disdetta</h2><p>L’abbonamento si rinnova automaticamente alla scadenza per lo stesso periodo. L’utente può disdire in qualsiasi momento dalla pagina Piani (“Gestisci o disdici”): la disdetta ha effetto alla fine del periodo già pagato, senza ulteriori addebiti. Eventuali variazioni di prezzo sono comunicate con almeno 30 giorni di anticipo e l’utente può disdire prima che si applichino.</p>
    <h2>7. Diritto di recesso</h2><p>Il consumatore ha diritto di recedere entro 14 giorni dalla sottoscrizione senza indicarne il motivo. Se chiede espressamente di accedere subito al servizio e riconosce che così perde il diritto di recesso (art. 59, lett. o, del Codice del Consumo), il recesso non si applica dal momento in cui l’accesso ha inizio. Senza tale richiesta, l’accesso inizia allo scadere dei 14 giorni.</p>
    <h2>8. Uso consentito</h2><p>L’account è personale. È vietato rivendere, ripubblicare o diffondere le analisi, in particolare per promuovere operatori di gioco, e tentare di aggirare le protezioni del servizio. In caso di violazione l’account può essere sospeso.</p>
    <h2>9. Disponibilità e dati di terzi</h2><p>Il servizio usa dati di fornitori terzi che possono essere incompleti, in ritardo o errati. {bizName(b)} si impegna a correggerli appena possibile, ma non risponde di decisioni prese su dati di terzi.</p>
    <h2>10. Responsabilità</h2><p>Nei limiti consentiti dalla legge, la responsabilità di {bizName(b)} è limitata all’importo pagato dall’utente negli ultimi 12 mesi. Restano ferme le tutele inderogabili del consumatore.</p>
    <h2>11. Legge e foro</h2><p>Si applica la legge italiana. Per i consumatori è competente il foro del luogo di residenza o domicilio del consumatore. Reclami: {b?.email || '[email]'}.</p>
  </LegalShell>;
}
