'use client';
import { LegalShell } from '../legal';

export default function Responsible() {
  return <LegalShell title="Gioco responsabile" updated="26 novembre 2026" draft={false}>
    <p className="pricing-lead">QUORUM nasce per far giocare meno e meglio: poche giocate con valore, puntate piccole, regole fisse. Se il gioco smette di essere un passatempo, fermati.</p>
    <h2>Le regole che QUORUM applica per te</h2><ul>
      <li>Puntata massima in percentuale del saldo, scelta da te nel Portafoglio.</li>
      <li>Stop giornaliero e stop sul calo del capitale: oltre la soglia QUORUM non registra nuove giocate.</li>
      <li>Livelli A/B/C: quando una giocata non supera i controlli, QUORUM ti dice di non giocarla.</li>
      <li>Nessun bonus, nessun invito a giocare, nessun link ai bookmaker.</li></ul>
    <h2>Segnali da non ignorare</h2><ul>
      <li>Giochi per recuperare quello che hai perso.</li>
      <li>Giochi somme che non puoi permetterti di perdere o che servono ad altro.</li>
      <li>Nascondi quanto giochi a chi ti sta vicino.</li>
      <li>Pensi spesso al gioco anche quando fai altro.</li></ul>
    <h2>Dove chiedere aiuto</h2><p><b>Telefono Verde Nazionale per le problematiche legate al gioco d’azzardo: 800 558 822</b> (Istituto Superiore di Sanità), gratuito e anonimo, dal lunedì al venerdì dalle 10 alle 16.</p>
    <p>Puoi anche chiedere l’autoesclusione dal gioco online a tutti i concessionari dal sito dell’Agenzia delle Dogane e dei Monopoli, e chiudere il tuo account QUORUM in qualsiasi momento.</p>
  </LegalShell>;
}
