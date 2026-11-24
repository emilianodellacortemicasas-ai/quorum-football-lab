'use client';
import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';

// "Cosa puoi fare qui": a short guide at the top of every page. Can be hidden; the ⓘ button brings it back.
const INTROS: Record<string, { title: string; items: string[] }> = {
  overview: { title: 'Panoramica', items: ['Vedi il backtest settimanale di ogni tipo di schedina: quante ne avrebbe vinte e con che rendimento.', 'Controlli capitale, rischio e andamento delle tue giocate.', 'Da qui vai al metodo e alle sezioni principali.'] },
  tipster: { title: 'Tipster', items: ['Trovi solo singole e doppie dove un bookmaker italiano (Lottomatica / Planetwin365, Snai, Sisal, Eurobet) paga più della quota giusta (Pinnacle senza margine).', 'Per ogni giocata vedi le quote dei 4 bookmaker a confronto: giochi dove paga di più.', 'Per ognuna: probabilità vera, quota giusta, valore e puntata in euro sul tuo capitale.', 'Il registro reale misura il metodo con rendimento e CLV: è qui che vedi se QUORUM ti dà un vantaggio.', 'Lo studio dei campionati mostra dove i bookmaker sbagliano di più.', 'Scheda “Tutte le quote di valore”: ogni quota sopra la quota giusta, anche fuori dai filtri del Tipster (ex sezione Valore).'] },
  predictions: { title: 'Pronostici', items: ['Tutte le partite dei prossimi 7 giorni con probabilità, quota giusta e affidabilità.', 'Per ogni partita: classifica, forma, indisponibili, riposo, partite in 14 giorni e coppe vicine.', 'Apri “Tutti i mercati” per gol, corner, cartellini e marcatori.', 'Scheda “Calendario e risultati”: scegli un giorno passato e vedi il risultato accanto al pronostico di QUORUM.'] },
  value: { title: 'Valore', items: ['Tutti gli esiti dove la quota paga più della probabilità stimata dal modello QUORUM.', 'Ordinali per valore o probabilità e aggiungili alla schedina.', 'Differenza con Tipster: qui decide il modello, in Tipster decide Pinnacle.'] },
  tickets: { title: 'Schedine pronte', items: ['Raddoppi, multiple del giorno, schedine da 3 e 5 squadre per fascia, schemi in cui puoi sbagliare, sistemi, Combo divise in slot (1X, X2, 12, 1, X, 2, Gol) con doppia chance + Goal, Under / Over e Multigol (partita, casa, ospite, 1° tempo), Multigol, Marcatori e bombe.', 'Ogni sezione mostra il suo backtest: vinte, previste e rendimento.', 'Copia, apri nel Laboratorio o registra con “L’ho giocata”.', 'Sono un servizio in più: per il capitale conta il metodo Tipster.'] },
  builder: { title: 'Costruisci schedina', items: ['Scegli tu gli eventi tra tutte le quote della settimana.', 'QUORUM misura in tempo reale affidabilità, valore e puntata giusta.', '“Costruisci la tua combo”: unisci esito o doppia chance, gol, Multigol (partita, casa, ospite, 1° tempo) e fino a due marcatori; QUORUM calcola la probabilità che si avverino tutte insieme.', 'Quando è pronta la registri o la mandi al Laboratorio.'] },
  lab: { title: 'Laboratorio', items: ['Imposti un sistema come su Planetwin365: singole, doppie, triple…', 'Vedi tutti gli scenari: quante combinazioni, quanto vinci con 2, 3, 4 esiti giusti.', 'Salvi e condividi il sistema con gli altri utenti.'] },
  lineups: { title: 'Formazioni', items: ['Le partite di oggi e dei prossimi 2 giorni, Roma e Juve in cima.', 'Tocca una partita: campo con gli undici, modulo, allenatore e panchina appena ufficiali.', 'Si aggiorna da solo ogni 2 minuti fino all’uscita delle formazioni.'] },
  tables: { title: 'Classifiche', items: ['Classifiche ufficiali di tutti i campionati di QUORUM con la forma delle ultime 5.', 'Zone Champions, Europa e retrocessione.', 'In alto il derby di famiglia Roma – Juve.'] },
  matches: { title: 'Partite', items: ['Il calendario giorno per giorno, per competizione.', 'Apri il Centro partita di ogni incontro.'] },
  results: { title: 'Risultati', items: ['Solo giocate terminate: le tue e le condivise, divise in vinte, perse e rimborsate.', 'Profitto, ROI e confronto con quanto prevedeva QUORUM.', 'Rendimento delle value bet, quota di chiusura e schedine proposte.'] },
  tcenter: { title: 'Centro Tipster', items: ['Ogni 3 ore il controllo completo come un professionista: valore, movimenti di Pinnacle, quote fresche, assenze, storico.', 'Opportunità con voto A/B/C, checklist e puntata in unità.', 'Prestazioni (fortuna o bravura), dove guadagni, movimenti, margini dei bookmaker e serie negative.'] },
  plays: { title: 'Le mie giocate e le condivise', items: ['Le tue giocate ancora in corso: condividile, correggi quote e puntata o eliminale.', 'Le giocate condivise dagli altri utenti ancora da giocare: copiale nella tua schedina o registrale con un tocco.', 'Quando le partite finiscono QUORUM le chiude da solo e le sposta in Risultati.'] },
  portfolio: { title: 'Portafoglio', items: ['Imposti budget e profilo di rischio: QUORUM calcola le puntate.', 'Diario di tutte le giocate e limiti di perdita.'] },
  method: { title: 'Il metodo', items: ['Le regole che tengono il capitale al sicuro.', 'Stress test: quante perdite di fila puoi reggere.'] },
  guide: { title: 'Guida', items: ['Ogni sezione spiegata con esempi.', 'Glossario delle parole di QUORUM.', 'Scheda “Il metodo”: le regole, la trasparenza e lo stress test sulle sconfitte di fila.'] },
  settings: { title: 'Impostazioni', items: ['Stato dei collegamenti ai dati e alle quote.', 'Come installare QUORUM sul telefono.'] },
};

export function PageIntro({ view }: { view: string }) {
  const it = INTROS[view], [hidden, setHidden] = useState(true);
  useEffect(() => { try { setHidden(localStorage.getItem('quorum-intro-' + view) === '0'); } catch { setHidden(false); } }, [view]);
  if (!it) return null;
  const set = (h: boolean) => { setHidden(h); try { localStorage.setItem('quorum-intro-' + view, h ? '0' : '1'); } catch {} };
  if (hidden) return <button className="intro-pill" onClick={() => set(false)}><Info size={14} />Cosa puoi fare qui</button>;
  return <section className="page-intro">
    <div className="pi-head"><span><Info size={16} /></span><b>Cosa puoi fare in {it.title}</b><button aria-label="Nascondi" onClick={() => set(true)}><X size={16} /></button></div>
    <ul>{it.items.map(x => <li key={x}>{x}</li>)}</ul>
  </section>;
}
